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
}

export class WebhookHandler {
  private subscriptionManager: SubscriptionManager;
  private notificationService: NotificationService;
  private config: WebhookHandlerConfig;

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
        affectedUsers: []
      };
    }

    // Process based on event type
    switch (eventType) {
      case 'ping':
        return this.processPingEvent(webhookPayload);
      
      case 'issues':
        return await this.processIssueEvent(webhookPayload);
      
      default:
        console.log(`Unhandled event type: ${eventType}`);
        return {
          type: 'unknown',
          repositoryId: '',
          affectedUsers: []
        };
    }
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
      repositoryId: '',
      affectedUsers: []
    };
  }

  /**
   * Process issue event
   */
  private async processIssueEvent(payload: GitHubWebhookPayload): Promise<ProcessedWebhookEvent> {
    if (!payload.action || !payload.issue || !payload.repository) {
      throw new Error('Invalid issue event payload - missing required fields');
    }

    const { action, issue, repository } = payload;
    const repositoryId = `${repository.owner.login}/${repository.name}`;

    console.log(`Processing issue event: ${action} for ${repositoryId}#${issue.number}`);

    // Only process 'opened' and 'labeled' actions
    if (action !== 'opened' && action !== 'labeled') {
      console.log(`Ignoring issue action: ${action}`);
      return {
        type: 'issue',
        repositoryId,
        affectedUsers: []
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

    // Send notifications to affected users
    const affectedUsersList = Array.from(affectedUsers);
    
    for (const userId of affectedUsersList) {
      try {
        // Determine which label triggered the notification
        let triggeredLabel = '';
        if (action === 'labeled' && payload.label) {
          triggeredLabel = payload.label.name;
        } else if (action === 'opened' && issue.labels.length > 0) {
          // For opened issues, we'll use the first label as the triggered label
          // In practice, we might want to send separate notifications for each subscribed label
          triggeredLabel = issue.labels[0].name;
        }

        await this.notificationService.sendIssueNotification(userId, issueInfo, triggeredLabel);
      } catch (error) {
        console.error(`Failed to send notification to user ${userId}:`, error);
        // Continue processing other users even if one fails
      }
    }

    return {
      type: 'issue',
      repositoryId,
      affectedUsers: affectedUsersList,
      issueInfo
    };
  }



  /**
   * Get webhook handler statistics
   */
  public getStats(): {
    allowedEvents: string[];
    hasWebhookSecret: boolean;
    maxPayloadSize: number;
  } {
    return {
      allowedEvents: [...this.config.allowedEvents],
      hasWebhookSecret: !!this.config.webhookSecret,
      maxPayloadSize: this.config.maxPayloadSize
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