import { logger } from '../utils/logger.js';

/**
 * Deadline render job submission.
 *
 * Uses the Deadline Web Service REST API to submit jobs.
 * The Deadline Web Service must be running and accessible.
 *
 * Note: If direct MongoDB injection is needed instead,
 * add mongodb as a dependency and reference the MC-Brum pattern.
 */

const DEADLINE_URL = process.env.DEADLINE_WEB_SERVICE_URL || 'http://deadline-server:8082';

export interface DeadlineJob {
  jobName: string;
  scenePath: string;
  cameraName: string;
  outputPath: string;
  outputFormat: string;
  resolvedConfig: Record<string, unknown>;
  pool?: string;
  priority?: number;
}

/**
 * Submit a render job to Deadline.
 */
export async function submitDeadlineJob(job: DeadlineJob): Promise<{ jobId: string }> {
  logger.info({ jobName: job.jobName, camera: job.cameraName }, 'Submitting Deadline job');

  const jobInfo = {
    Plugin: 'CoronaRenderer',
    Name: job.jobName,
    Comment: `Auto-submitted from Brum Flow`,
    Pool: job.pool || 'london',
    Priority: job.priority ?? 50,
    OutputDirectory0: job.outputPath,
    OutputFilename0: `${job.jobName}.${job.outputFormat.toLowerCase()}`,
  };

  const pluginInfo = {
    SceneFile: job.scenePath,
    Camera: job.cameraName,
    ...job.resolvedConfig,
  };

  try {
    const res = await fetch(`${DEADLINE_URL}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ JobInfo: jobInfo, PluginInfo: pluginInfo }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Deadline API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const jobId = data._id || data.JobId || 'unknown';
    logger.info({ jobId, jobName: job.jobName }, 'Deadline job submitted');
    return { jobId };
  } catch (err) {
    logger.error({ err, jobName: job.jobName }, 'Failed to submit Deadline job');
    throw err;
  }
}

/**
 * Submit multiple render jobs for a batch of resolved paths.
 */
export async function submitBatch(jobs: DeadlineJob[]): Promise<{ jobId: string }[]> {
  const results: { jobId: string }[] = [];
  for (const job of jobs) {
    const result = await submitDeadlineJob(job);
    results.push(result);
  }
  return results;
}
