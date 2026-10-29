import relationships from './relationships.js';
import sales from './sales.js';
import success from './success.js';
import workspace from './workspace.js';
export const plugins = [relationships, sales, success, workspace] as const;
