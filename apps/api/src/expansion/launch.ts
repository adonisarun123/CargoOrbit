import type {Phase} from './types.js';
import type {LaunchContext} from './launch-kit.js';
import {executeTelemetry,telemetryActions} from './telemetry-launch.js';
import {executeWarehouse,warehouseActions} from './warehouse-launch.js';
import {executeFinanceLaunch,financeLaunchActions} from './finance-launch.js';
import {advancedActions,executeAdvanced} from './advanced-launch.js';
export const launchActions=new Set([...telemetryActions,...warehouseActions,...financeLaunchActions,...advancedActions]);
export const launchPhase=(action:string):Phase=>warehouseActions.has(action)?'P3':advancedActions.has(action)?'P4':'P2';
export async function executeLaunch(l:LaunchContext,action:string,input:Record<string,unknown>){if(telemetryActions.has(action))return executeTelemetry(l,action,input);if(warehouseActions.has(action)){const result=await executeWarehouse(l,action,input);if(l.ctx.role==='warehouse'&&result&&typeof result==='object'&&!Array.isArray(result)){const {expectedSnapshot,stockSnapshot,stockUpdatedAt,...visible}=result as Record<string,unknown>;return visible;}return result;}if(financeLaunchActions.has(action))return executeFinanceLaunch(l,action,input);return executeAdvanced(l,action,input);}
const fleet=['owner','operations','control_room','auditor'],warehouse=['owner','warehouse','auditor'],finance=['owner','finance','auditor'];
export const launchResources:Record<string,{kind:string;phase:Phase;roles:string[]}>= {
 operationalRules:{kind:'operational_rules',phase:'P2',roles:fleet},vehicleProfiles:{kind:'vehicle_profiles',phase:'P2',roles:fleet},
 fuelEntries:{kind:'fuel_entries',phase:'P2',roles:[...fleet,'finance']},tollEvents:{kind:'toll_events',phase:'P2',roles:[...fleet,'finance']},costReconciliations:{kind:'cost_reconciliations',phase:'P2',roles:[...fleet,'finance']},
 recoveryReports:{kind:'recovery_reports',phase:'P2',roles:finance},recoveryVerifications:{kind:'recovery_verifications',phase:'P2',roles:finance},
 asns:{kind:'asns',phase:'P3',roles:warehouse},warehouseTasks:{kind:'warehouse_tasks',phase:'P3',roles:warehouse},warehouseTaskEvents:{kind:'warehouse_task_events',phase:'P3',roles:warehouse},qualityReviews:{kind:'quality_reviews',phase:'P3',roles:warehouse},replenishments:{kind:'replenishments',phase:'P3',roles:warehouse},handlingMovements:{kind:'handling_movements',phase:'P3',roles:warehouse},handlingExceptions:{kind:'handling_exceptions',phase:'P3',roles:warehouse},
 advancedCapabilities:{kind:'advanced_capabilities',phase:'P4',roles:['owner','auditor']},maintenanceSignals:{kind:'maintenance_signals',phase:'P4',roles:fleet},maintenanceRules:{kind:'maintenance_rules',phase:'P4',roles:fleet},layoutVersions:{kind:'layout_versions',phase:'P4',roles:['owner','auditor']},slottingProposals:{kind:'slotting_proposals',phase:'P4',roles:['owner','auditor']},
};
