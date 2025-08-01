import { createHmac, timingSafeEqual } from 'crypto';
import { Request, Response, Router } from 'express';
import { GitHubWebhookPayload } from '../models/types';
import { SubscriptionManager } from '../services/subscription-manager';
import { NotificationService, IssueInfo } from '../services/notification-service';

export interface WebhookHandlerConfig {
  webhookSecret: string;
  maxPayloadSize: number;
  allowedEvents: string[];
}

export interface WebhookValidationResult {
  isValid: boolean;
  error?: string;
}

export interface ProcessedWebhookEvent {
  type: 'issue' | 'ping' | 'unknown';
  repositoryId: string;
  affectedUsers: string[];
  issueInfo?: IssueInfo;
  eventId?: string;
  processedAt: Date;
  filtered?: boolean;
  filterReason?: string;
}

export class WebhookHandler {
  private subscriptionManager: SubscriptionManager;
  private notificationService: NotificationService;
  private config: WebhookHandlerConfig;
  private processedEvents: Map<string, Date> = new Map(); // For deduplication
  private readonly eventTTL = 5 * 60 * 1000; // 5 minutes TTL for processed events

  constructor(
    subscriptionManager: SubscriptionManager,
    notificationService: NotificationService,
    config?: Partial<WebhookHandlerConfig>
  ) {
    this.subscriptionManager = subscriptionManager;
    this.notificationService = notificationService;
    this.config = {
      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
      maxPayloadSize: 1024 * 1024, // 1MB
      allowedEvents: ['issues', 'ping'],
      ...config
    };

    if (!this.config.webhookSecret) {
      console.warn('GitHub webhook secret not configured - webhook signature validation will be skipped');
    }

    // Start cleanup interval for processed events
    this.startEventCleanup();
  }

  /**
   * Validate webhook signature
   */
  validateSignature(payload: string, signature: string): WebhookValidationResult {
    if (!this.config.webhookSecret) {
      console.warn('Webhook secret not configured, skipping signature validation');
      return { isValid: true };
    }

    if (!signature) {
      return { isValid: false, error: 'Missing signature header' };
    }

    // GitHub sends signature as "sha256=<hash>"
    const expectedSignature = signature.startsWith('sha256=') ? signature : `sha256=${signature}`;
    
    try {
      const computedSignature = 'sha256=' + createHmac('sha256', this.config.webhookSecret)
        .update(payload, 'utf8')
        .digest('hex');

      // Use timing-safe comparison to prevent timing attacks
      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const computedBuffer = Buffer.from(computedSignature, 'utf8');

      if (expectedBuffer.length !== computedBuffer.length) {
        return { isValid: false, error: 'Signature length mismatch' };
      }

      const isValid = timingSafeEqual(expectedBuffer, computedBuffer);
      
      if (!isValid) {
        return { isValid: false, error: 'Invalid signature' };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: `Signature validation error: ${error}` };
    }
  }

  /**
   * Process incoming webhook payload
   */
  async processWebhook(
    payload: string,
    headers: Record<string, string>
  ): Promise<ProcessedWebhookEvent> {
    // Validate payload size
    if (payload.length > this.config.maxPayloadSize) {
      throw new Error(`Payload too large: ${payload.length} bytes (max: ${this.config.maxPayloadSize})`);
    }

    // Validate signature
    const signature = headers['x-hub-signature-256'] || headers['X-Hub-Signature-256'];
    const validationResult = this.validateSignature(payload, signature);
    
    if (!validationResult.isValid) {
      throw new Error(`Webhook signature validation failed: ${validationResult.error}`);
    }

    // Parse payload
    let webhookPayload: GitHubWebhookPayload;
    try {
      webhookPayload = JSON.parse(payload);
    } catch (error) {
      throw new Error(`Invalid JSON payload: ${error}`);
    }

    // Get event type from headers
    const eventType = headers['x-github-event'] || headers['X-GitHub-Event'];
    
    if (!eventType) {
      throw new Error('Missing X-GitHub-Event header');
    }

    // Check if event type is allowed
    if (!this.config.allowedEvents.includes(eventType)) {
      console.log(`Ignoring unsupported event type: ${eventType}`);
      return {
        type: 'unknown',
        repositoryId: '',
        affectedUsers: [],
        processedAt: new Date()
      };
    }

    // Generate event ID for deduplication
    const eventId = this.generateEventId(webhookPayload, eventType);
    
    // Check for duplicate events
    if (this.isDuplicateEvent(eventId)) {
      console.log(`Duplicate event detected: ${eventId}`);
      return {
        type: 'unknown',
        repositoryId: webhookPayload.repository?.full_name || '',
        affectedUsers: [],
        eventId,
        processedAt: new Date(),
        filtered: true,
        filterReason: 'Duplicate event'
      };
    }

    // Mark event as processed
    this.markEventProcessed(eventId);

    // Process based on event type
    let result: ProcessedWebhookEvent;
    switch (eventType) {
      case 'ping':
        result = this.processPingEvent(webhookPayload);
        break;
      
      case 'issues':
        result = await this.processIssueEvent(webhookPayload);
        break;
      
      default:
        console.log(`Unhandled event type: ${eventType}`);
        result = {
          type: 'unknown',
          repositoryId: '',
          affectedUsers: [],
          processedAt: new Date()
        };
    }

    // Add event metadata
    result.eventId = eventId;
    result.processedAt = new Date();

    return result;
  }

  /**
   * Process ping event (webhook test)
   */
  private processPingEvent(payload: GitHubWebhookPayload): ProcessedWebhookEvent {
    console.log('Received GitHub webhook ping event');
    
    if (payload.zen) {
      console.log(`GitHub Zen: ${payload.zen}`);
    }

    return {
      type: 'ping',
      repositoryId: payload.repository?.full_name || '',
      affectedUsers: [],
      processedAt: new Date()
    };
  }

  /**
   * Process issue event with enhanced filtering
   */
  private async processIssueEvent(payload: GitHubWebhookPayload): Promise<ProcessedWebhookEvent> {
    if (!payload.action || !payload.issue || !payload.repository) {
      throw new Error('Invalid issue event payload - missing required fields');
    }

    const { action, issue, repository } = payload;
    const repositoryId = `${repository.owner.login}/${repository.name}`;

    console.log(`Processing issue event: ${action} for ${repositoryId}#${issue.number}`);

    // Apply event filtering
    const filterResult = this.filterIssueEvent(payload);
    if (filterResult.filtered) {
      console.log(`Filtered issue event: ${filterResult.reason}`);
      return {
        type: 'issue',
        repositoryId,
        affectedUsers: [],
        processedAt: new Date(),
        filtered: true,
        filterReason: filterResult.reason || 'Unknown filter reason'
      };
    }

    // Extract issue information
    const issueInfo: IssueInfo = {
      title: issue.title,
      number: issue.number,
      url: issue.html_url,
      repositoryName: repository.name,
      repositoryOwner: repository.owner.login,
      author: issue.user.login,
      labels: issue.labels.map(label => label.name),
      action: action as 'opened' | 'labeled'
    };

    // Find affected users based on labels
    const affectedUsers = new Set<string>();

    // For 'labeled' action, only notify for the specific label that was added
    if (action === 'labeled' && payload.label) {
      const labelName = payload.label.name;
      const subscribers = await this.subscriptionManager.findSubscribersForLabel(repositoryId, labelName);
      subscribers.forEach(userId => affectedUsers.add(userId));
      
      console.log(`Found ${subscribers.length} subscribers for label "${labelName}" in ${repositoryId}`);
    }
    // For 'opened' action, notify for all labels on the issue
    else if (action === 'opened') {
      for (const label of issue.labels) {
        const subscribers = await this.subscriptionManager.findSubscribersForLabel(repositoryId, label.name);
        subscribers.forEach(userId => affectedUsers.add(userId));
      }
      
      console.log(`Found ${affectedUsers.size} total subscribers for issue labels in ${repositoryId}`);
    }

    // Send notifications to affected users using the notification pipeline
    const affectedUsersList = Array.from(affectedUsers);
    await this.processNotificationPipeline(affectedUsersList, issueInfo, action, payload.label);

    return {
      type: 'issue',
      repositoryId,
      affectedUsers: affectedUsersList,
      issueInfo,
      processedAt: new Date()
    };
  }

  /**
   * Filter issue events to determine if they should be processed
   */
  private filterIssueEvent(payload: GitHubWebhookPayload): { filtered: boolean; reason?: string } {
    const { action, issue } = payload;

    if (!issue) {
      return { filtered: true, reason: 'Missing issue data' };
    }

    // Only process 'opened' and 'labeled' actions
    if (action !== 'opened' && action !== 'labeled') {
      return { filtered: true, reason: `Unsupported action: ${action}` };
    }

    // Skip draft issues (if the property exists)
    if ('draft' in issue && issue.draft) {
      return { filtered: true, reason: 'Issue is a draft' };
    }

    // Skip issues from bots (optional filtering)
    if ('type' in issue.user && issue.user.type === 'Bot' && process.env.FILTER_BOT_ISSUES === 'true') {
      return { filtered: true, reason: 'Issue created by bot' };
    }

    // For labeled events, ensure a label was actually added
    if (action === 'labeled' && !payload.label) {
      return { filtered: true, reason: 'Labeled event without label information' };
    }

    // Skip if issue has no labels (for opened events)
    if (action === 'opened' && (!issue.labels || issue.labels.length === 0)) {
      return { filtered: true, reason: 'Opened issue has no labels' };
    }

    return { filtered: false };
  }

  /**
   * Process notification pipeline with enhanced error handling
   */
  private async processNotificationPipeline(
    userIds: string[],
    issueInfo: IssueInfo,
    action: string,
    triggeredLabel?: any
  ): Promise<void> {
    const notificationPromises = userIds.map(async (userId) => {
      try {
        // Determine which label triggered the notification
        let labelName = '';
        if (action === 'labeled' && triggeredLabel) {
          labelName = triggeredLabel.name;
        } else if (action === 'opened' && issueInfo.labels.length > 0) {
          // For opened issues, send notifications for each subscribed label
          const userSubscriptions = await this.subscriptionManager.getUserSubscriptions(userId);
          const subscribedLabels = userSubscriptions.subscriptionsByRepository
            .find(sub => sub.repository.id === `${issueInfo.repositoryOwner}/${issueInfo.repositoryName}`)
            ?.subscription.labels || [];

          // Find the first matching label
          labelName = issueInfo.labels.find(label => subscribedLabels.includes(label)) || issueInfo.labels[0];
        }

        await this.notificationService.sendIssueNotification(userId, issueInfo, labelName);
        console.log(`Notification sent to user ${userId} for label "${labelName}"`);
      } catch (error) {
        console.error(`Failed to send notification to user ${userId}:`, error);
        // Continue processing other users even if one fails
      }
    });

    // Wait for all notifications to complete
    await Promise.allSettled(notificationPromises);
  }

  /**
   * Generate unique event ID for deduplication
   */
  private generateEventId(payload: GitHubWebhookPayload, eventType: string): string {
    const repository = payload.repository?.full_name || 'unknown';
    const timestamp = new Date().toISOString();
    
    if (eventType === 'issues' && payload.issue) {
      return `${eventType}-${repository}-${payload.issue.number}-${payload.action}-${timestamp}`;
    }
    
    return `${eventType}-${repository}-${timestamp}`;
  }

  /**
   * Check if event has already been processed
   */
  private isDuplicateEvent(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }

  /**
   * Mark event as processed
   */
  private markEventProcessed(eventId: string): void {
    this.processedEvents.set(eventId, new Date());
  }

  /**
   * Start cleanup interval for processed events
   */
  private startEventCleanup(): void {
    setInterval(() => {
      const now = new Date();
      const expiredEvents: string[] = [];

      for (const [eventId, processedAt] of this.processedEvents.entries()) {
        if (now.getTime() - processedAt.getTime() > this.eventTTL) {
          expiredEvents.push(eventId);
        }
      }

      expiredEvents.forEach(eventId => {
        this.processedEvents.delete(eventId);
      });

      if (expiredEvents.length > 0) {
        console.log(`Cleaned up ${expiredEvents.length} expired event records`);
      }
    }, 60000); // Run cleanup every minute
  }



  /**
   * Get webhook handler statistics
   */
  public getStats(): {
    allowedEvents: string[];
    hasWebhookSecret: boolean;
    maxPayloadSize: number;
    processedEventsCount: number;
    eventTTL: number;
  } {
    return {
      allowedEvents: [...this.config.allowedEvents],
      hasWebhookSecret: !!this.config.webhookSecret,
      maxPayloadSize: this.config.maxPayloadSize,
      processedEventsCount: this.processedEvents.size,
      eventTTL: this.eventTTL
    };
  }

  /**
   * Update webhook configuration
   */
  public updateConfig(newConfig: Partial<WebhookHandlerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Webhook handler configuration updated');
  }

  /**
   * Create Express router for webhook endpoints
   */
  public createRouter(): Router {
    const router = Router();

    // Middleware to capture raw body for signature validation
    router.use('/webhook', (req: Request, _res: Response, next) => {
      let data = '';
      req.setEncoding('utf8');
      
      req.on('data', (chunk) => {
        data += chunk;
      });
      
      req.on('end', () => {
        (req as any).rawBody = data;
        next();
      });
    });

    // GitHub webhook endpoint
    router.post('/webhook', async (req: Request, res: Response) => {
      try {
        const rawBody = (req as any).rawBody;
        
        if (!rawBody) {
          res.status(400).json({ error: 'Missing request body' });
          return;
        }

        // Process the webhook
        const result = await this.processWebhook(rawBody, req.headers as Record<string, string>);
        
        // Log the result
        console.log(`Webhook processed: ${result.type}, affected users: ${result.affectedUsers.length}`);
        
        // Return success response
        res.status(200).json({
          success: true,
          type: result.type,
          affectedUsers: result.affectedUsers.length,
          repositoryId: result.repositoryId
        });

      } catch (error) {
        console.error('Webhook processing error:', error);
        
        // Return error response
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Health check endpoint
    router.get('/webhook/health', (_req: Request, res: Response) => {
      const stats = this.getStats();
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        config: stats
      });
    });

    return router;
  }
}