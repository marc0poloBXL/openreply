module.exports = {
  apps: [
    {
      name: "openreply-worker",
      // Windows-compatible: use node directly with a CJS wrapper that
      // registers tsx as a require hook so it can import .ts files.
      script: "worker/production-runner.cjs",
      interpreter: "node",
      cwd: __dirname,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 10000,
      max_size: "10M",
      retain: 3,
    },
  ],
};