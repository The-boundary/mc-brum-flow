import net from 'net';
import { logger } from '../utils/logger.js';

const TCP_HOST = process.env.MAX_TCP_HOST || '192.168.0.51';
const TCP_PORT = parseInt(process.env.MAX_TCP_PORT || '8889', 10);
const TIMEOUT = 10_000;

export interface MaxCommand {
  action: string;
  payload: Record<string, unknown>;
}

/**
 * Send a command to 3ds Max via TCP bridge.
 * The bridge runs a Python socket server inside Max that evaluates MaxScript.
 */
export async function sendToMax(command: MaxCommand): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let response = '';

    client.setTimeout(TIMEOUT);

    client.connect(TCP_PORT, TCP_HOST, () => {
      const payload = JSON.stringify(command) + '\n';
      client.write(payload);
    });

    client.on('data', (data) => {
      response += data.toString();
    });

    client.on('end', () => {
      resolve(response.trim());
    });

    client.on('timeout', () => {
      client.destroy();
      reject(new Error(`TCP timeout connecting to ${TCP_HOST}:${TCP_PORT}`));
    });

    client.on('error', (err) => {
      reject(new Error(`TCP error: ${err.message}`));
    });
  });
}

/**
 * Push resolved render config to 3ds Max.
 * Sends a command to apply camera, layers, tone mapping, resolution, etc.
 */
export async function pushConfigToMax(config: {
  cameraName: string;
  resolvedConfig: Record<string, unknown>;
}): Promise<string> {
  const command: MaxCommand = {
    action: 'applyRenderConfig',
    payload: {
      camera: config.cameraName,
      settings: config.resolvedConfig,
    },
  };

  logger.info({ camera: config.cameraName }, 'Pushing config to 3ds Max');
  return sendToMax(command);
}
