export interface StageStep {
  assignee_type: 'role' | 'user';
  assignee_role: string;
  assignee_user_id: string | number | null;
}

export interface SingleStage {
  type: 'single';
  step: StageStep;
}

export interface ParallelStage {
  type: 'parallel';
  steps: StageStep[];
}

export type Stage = SingleStage | ParallelStage;

export function flattenStages(stages: Stage[]) {
  const steps: any[] = [];
  let sequenceCounter = 1;
  let groupCounter = 1;

  stages.forEach((stage) => {
    if (stage.type === 'single') {
      const payloadStep: any = {
        sequence: sequenceCounter++,
        group_sequence: groupCounter++,
        approval_policy: 'ALL',
      };
      if (stage.step.assignee_type === 'user') {
        payloadStep.assignee_user_id = Number(stage.step.assignee_user_id);
      } else {
        payloadStep.assignee_role = stage.step.assignee_role;
      }
      steps.push(payloadStep);
    } else {
      const currentGroup = groupCounter++;
      stage.steps.forEach((s) => {
        const payloadStep: any = {
          sequence: sequenceCounter++,
          group_sequence: currentGroup,
          approval_policy: 'ALL',
        };
        if (s.assignee_type === 'user') {
          payloadStep.assignee_user_id = Number(s.assignee_user_id);
        } else {
          payloadStep.assignee_role = s.assignee_role;
        }
        steps.push(payloadStep);
      });
    }
  });

  return steps;
}
