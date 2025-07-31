describe('Project Setup', () => {
  it('should have proper test environment', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('should be able to run basic assertions', () => {
    expect(1 + 1).toBe(2);
    expect('hello').toBe('hello');
    expect(true).toBeTruthy();
  });
});