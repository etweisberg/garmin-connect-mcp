import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ── Workout Templates (MCP Resources) ──────────────────────────────────────
// Templates adapted from Taxuspt/garmin_mcp (MIT License, Copyright (c) 2025 Alexandre Domingues)
// https://github.com/Taxuspt/garmin_mcp/blob/main/src/garmin_mcp/workout_templates.py

const WORKOUT_TEMPLATES: Record<string, unknown> = {
  "simple-run": {
    workoutName: "Simple Run",
    sportType: { sportTypeId: 1, sportTypeKey: "running" },
    workoutSegments: [
      {
        segmentOrder: 1,
        sportType: { sportTypeId: 1, sportTypeKey: "running" },
        workoutSteps: [
          {
            type: "ExecutableStepDTO",
            stepOrder: 1,
            stepType: { stepTypeId: 1, stepTypeKey: "warmup" },
            endCondition: { conditionTypeId: 2, conditionTypeKey: "time" },
            endConditionValue: 300.0,
            targetType: {
              workoutTargetTypeId: 1,
              workoutTargetTypeKey: "no.target",
            },
          },
          {
            type: "ExecutableStepDTO",
            stepOrder: 2,
            stepType: { stepTypeId: 3, stepTypeKey: "interval" },
            endCondition: { conditionTypeId: 2, conditionTypeKey: "time" },
            endConditionValue: 1800.0,
            targetType: {
              workoutTargetTypeId: 1,
              workoutTargetTypeKey: "no.target",
            },
          },
          {
            type: "ExecutableStepDTO",
            stepOrder: 3,
            stepType: { stepTypeId: 2, stepTypeKey: "cooldown" },
            endCondition: { conditionTypeId: 2, conditionTypeKey: "time" },
            endConditionValue: 300.0,
            targetType: {
              workoutTargetTypeId: 1,
              workoutTargetTypeKey: "no.target",
            },
          },
        ],
      },
    ],
  },

  "interval-running": {
    workoutName: "Interval Running",
    sportType: { sportTypeId: 1, sportTypeKey: "running" },
    workoutSegments: [
      {
        segmentOrder: 1,
        sportType: { sportTypeId: 1, sportTypeKey: "running" },
        workoutSteps: [
          {
            type: "ExecutableStepDTO",
            stepOrder: 1,
            stepType: { stepTypeId: 1, stepTypeKey: "warmup" },
            endCondition: { conditionTypeId: 2, conditionTypeKey: "time" },
            endConditionValue: 600.0,
            targetType: {
              workoutTargetTypeId: 1,
              workoutTargetTypeKey: "no.target",
            },
          },
          {
            type: "RepeatGroupDTO",
            stepOrder: 2,
            numberOfIterations: 6,
            workoutSteps: [
              {
                type: "ExecutableStepDTO",
                stepOrder: 1,
                stepType: { stepTypeId: 3, stepTypeKey: "interval" },
                endCondition: { conditionTypeId: 2, conditionTypeKey: "time" },
                endConditionValue: 60.0,
                targetType: {
                  workoutTargetTypeId: 4,
                  workoutTargetTypeKey: "heart.rate.zone",
                },
                zoneNumber: 5,
              },
              {
                type: "ExecutableStepDTO",
                stepOrder: 2,
                stepType: { stepTypeId: 4, stepTypeKey: "recovery" },
                endCondition: { conditionTypeId: 2, conditionTypeKey: "time" },
                endConditionValue: 90.0,
                targetType: {
                  workoutTargetTypeId: 4,
                  workoutTargetTypeKey: "heart.rate.zone",
                },
                zoneNumber: 2,
              },
            ],
          },
          {
            type: "ExecutableStepDTO",
            stepOrder: 3,
            stepType: { stepTypeId: 2, stepTypeKey: "cooldown" },
            endCondition: { conditionTypeId: 2, conditionTypeKey: "time" },
            endConditionValue: 600.0,
            targetType: {
              workoutTargetTypeId: 1,
              workoutTargetTypeKey: "no.target",
            },
          },
        ],
      },
    ],
  },

  "tempo-run": {
    workoutName: "Tempo Run",
    sportType: { sportTypeId: 1, sportTypeKey: "running" },
    workoutSegments: [
      {
        segmentOrder: 1,
        sportType: { sportTypeId: 1, sportTypeKey: "running" },
        workoutSteps: [
          {
            type: "ExecutableStepDTO",
            stepOrder: 1,
            stepType: { stepTypeId: 1, stepTypeKey: "warmup" },
            endCondition: { conditionTypeId: 2, conditionTypeKey: "time" },
            endConditionValue: 600.0,
            targetType: {
              workoutTargetTypeId: 4,
              workoutTargetTypeKey: "heart.rate.zone",
            },
            zoneNumber: 2,
          },
          {
            type: "ExecutableStepDTO",
            stepOrder: 2,
            stepType: { stepTypeId: 3, stepTypeKey: "interval" },
            endCondition: { conditionTypeId: 2, conditionTypeKey: "time" },
            endConditionValue: 1200.0,
            targetType: {
              workoutTargetTypeId: 4,
              workoutTargetTypeKey: "heart.rate.zone",
            },
            zoneNumber: 4,
          },
          {
            type: "ExecutableStepDTO",
            stepOrder: 3,
            stepType: { stepTypeId: 2, stepTypeKey: "cooldown" },
            endCondition: { conditionTypeId: 2, conditionTypeKey: "time" },
            endConditionValue: 600.0,
            targetType: {
              workoutTargetTypeId: 4,
              workoutTargetTypeKey: "heart.rate.zone",
            },
            zoneNumber: 2,
          },
        ],
      },
    ],
  },

  "strength-circuit": {
    workoutName: "Strength Circuit",
    description: "Strength training workout template",
    sportType: { sportTypeId: 5, sportTypeKey: "strength_training" },
    workoutSegments: [
      {
        segmentOrder: 1,
        sportType: { sportTypeId: 5, sportTypeKey: "strength_training" },
        workoutSteps: [
          {
            type: "ExecutableStepDTO",
            stepOrder: 1,
            stepType: { stepTypeId: 1, stepTypeKey: "warmup" },
            description: "Warmup description",
            endCondition: { conditionTypeId: 2, conditionTypeKey: "time" },
            endConditionValue: 600.0,
            targetType: {
              workoutTargetTypeId: 1,
              workoutTargetTypeKey: "no.target",
            },
            category: "WARM_UP",
            exerciseName: "",
          },
          {
            type: "RepeatGroupDTO",
            stepOrder: 2,
            numberOfIterations: 3,
            skipLastRestStep: true,
            workoutSteps: [
              {
                type: "ExecutableStepDTO",
                stepOrder: 1,
                stepType: { stepTypeId: 3, stepTypeKey: "interval" },
                description: "Bench press 115lb × 10 reps",
                endCondition: { conditionTypeId: 10, conditionTypeKey: "reps" },
                endConditionValue: 10,
                targetType: {
                  workoutTargetTypeId: 1,
                  workoutTargetTypeKey: "no.target",
                },
                category: "BENCH_PRESS",
                exerciseName: "",
                weightValue: 115.0,
                weightUnit: { unitId: 9, unitKey: "pound", factor: 453.59237 },
              },
              {
                type: "ExecutableStepDTO",
                stepOrder: 2,
                stepType: { stepTypeId: 4, stepTypeKey: "recovery" },
                description: "Transition to push-ups (60 sec)",
                endCondition: { conditionTypeId: 2, conditionTypeKey: "time" },
                endConditionValue: 60.0,
                targetType: {
                  workoutTargetTypeId: 1,
                  workoutTargetTypeKey: "no.target",
                },
              },
              {
                type: "ExecutableStepDTO",
                stepOrder: 3,
                stepType: { stepTypeId: 3, stepTypeKey: "interval" },
                description: "Push-ups × 10 reps (bodyweight)",
                endCondition: { conditionTypeId: 10, conditionTypeKey: "reps" },
                endConditionValue: 10,
                targetType: {
                  workoutTargetTypeId: 1,
                  workoutTargetTypeKey: "no.target",
                },
                category: "PUSH_UP",
                exerciseName: "PUSH_UP",
                weightValue: null,
                weightUnit: null,
              },
              {
                type: "ExecutableStepDTO",
                stepOrder: 4,
                stepType: { stepTypeId: 4, stepTypeKey: "recovery" },
                description: "Transition to bicep curls (60 sec)",
                endCondition: { conditionTypeId: 2, conditionTypeKey: "time" },
                endConditionValue: 60.0,
                targetType: {
                  workoutTargetTypeId: 1,
                  workoutTargetTypeKey: "no.target",
                },
              },
              {
                type: "ExecutableStepDTO",
                stepOrder: 5,
                stepType: { stepTypeId: 3, stepTypeKey: "interval" },
                description: "Bicep curls 25lb × 12 reps",
                endCondition: { conditionTypeId: 10, conditionTypeKey: "reps" },
                endConditionValue: 12,
                targetType: {
                  workoutTargetTypeId: 1,
                  workoutTargetTypeKey: "no.target",
                },
                category: "CURL",
                exerciseName: "ALTERNATING_DUMBBELL_BICEPS_CURL",
                weightValue: 25.0,
                weightUnit: { unitId: 9, unitKey: "pound", factor: 453.59237 },
              },
              {
                type: "ExecutableStepDTO",
                stepOrder: 6,
                stepType: { stepTypeId: 4, stepTypeKey: "recovery" },
                description: "Rest 2 min before next round",
                endCondition: { conditionTypeId: 2, conditionTypeKey: "time" },
                endConditionValue: 120.0,
                targetType: {
                  workoutTargetTypeId: 1,
                  workoutTargetTypeKey: "no.target",
                },
              },
            ],
          },
        ],
      },
    ],
  },
};

const WORKOUT_STRUCTURE_REFERENCE = `# Garmin Connect Workout JSON Structure Reference

## Top-level fields
- workoutName: string (required)
- sportType: { sportTypeId: number, sportTypeKey: string } (required)
  - IDs: 1=running, 2=cycling, 3=swimming, 4=walking, 5=strength_training
- workoutSegments: array of segment objects (required)
- description: string (optional)

## Segment fields
- segmentOrder: number (1-based, required)
- sportType: same as top-level (required)
- workoutSteps: array of step objects (required)

## Step types

### ExecutableStepDTO (regular steps)
- type: "ExecutableStepDTO" (required)
- stepOrder: number (1-based within the containing steps array)
- stepType: { stepTypeId: number, stepTypeKey: string }
  - 1="warmup", 2="cooldown", 3="interval", 4="recovery", 5="rest"
- endCondition: { conditionTypeId: number, conditionTypeKey: string }
  - 2="time" (endConditionValue in seconds)
  - 3="distance" (endConditionValue in meters)
  - 7="lap.button" (press lap button; no endConditionValue needed)
  - 10="reps" (endConditionValue = rep count — use for strength exercises)
- endConditionValue: number (required for time/distance/reps conditions)
- targetType: { workoutTargetTypeId: number, workoutTargetTypeKey: string }
  - 1="no.target"
  - 2="speed" — use targetValueOne/targetValueTwo (m/s)
  - 4="heart.rate.zone" — use zoneNumber (1-5), NOT targetValueOne/targetValueTwo
  - 6="cadence" — use targetValueOne/targetValueTwo (steps per minute)
  - 11="power.zone" — use zoneNumber
- zoneNumber: number 1-5 (for heart.rate.zone or power.zone targets only)
- targetValueOne: number (lower bound for speed/cadence ranges)
- targetValueTwo: number (upper bound for speed/cadence ranges)
- description: string (optional, displayed on device)

### Strength exercise fields (interval steps in strength_training workouts)
- category: string — exercise category (e.g. "BENCH_PRESS", "SQUAT", "PUSH_UP", "CURL")
- exerciseName: string — specific variant (e.g. "PUSH_UP", "ALTERNATING_DUMBBELL_BICEPS_CURL"); use "" if only one variant
- weightValue: number | null — weight in pounds as float; null/omit for bodyweight
- weightUnit: { unitId: 9, unitKey: "pound", factor: 453.59237 } | null — omit/null for bodyweight
- Warmup steps: set category="WARM_UP", exerciseName=""
- Recovery/transition steps: omit category and exerciseName (or set to null)

Exercise names from FIT SDK (not yet fully validated against Connect API):
| Category | exerciseName variants |
|----------|-----------------------|
| BENCH_PRESS | BARBELL_BENCH_PRESS, DUMBBELL_BENCH_PRESS, INCLINE_BARBELL_BENCH_PRESS, INCLINE_DUMBBELL_BENCH_PRESS, DECLINE_BARBELL_BENCH_PRESS, CLOSE_GRIP_BARBELL_BENCH_PRESS |
| SQUAT | BARBELL_BACK_SQUAT, BARBELL_FRONT_SQUAT, BODYWEIGHT_SQUAT, DUMBBELL_SQUAT, GOBLET_SQUAT, HACK_SQUAT, LEG_PRESS, SUMO_SQUAT, WALL_SIT |
| DEADLIFT | BARBELL_DEADLIFT, DUMBBELL_DEADLIFT, ROMANIAN_DEADLIFT, SINGLE_LEG_DEADLIFT, STIFF_LEG_DEADLIFT, SUMO_DEADLIFT |
| LUNGE | BARBELL_LUNGE, BODYWEIGHT_LUNGE, DUMBBELL_LUNGE, FORWARD_LUNGE, LATERAL_LUNGE, REVERSE_LUNGE, WALKING_LUNGE |
| ROW | CABLE_ROW, DUMBBELL_ROW, INVERTED_ROW, SEATED_CABLE_ROW, SINGLE_ARM_DUMBBELL_ROW, T_BAR_ROW |
| PULL_UP | PULL_UP, CHIN_UP, WEIGHTED_PULL_UP, CLOSE_GRIP_PULLDOWN, BANDED_PULL_UPS |
| SHOULDER_PRESS | OVERHEAD_DUMBBELL_PRESS, BARBELL_SHOULDER_PRESS, DUMBBELL_SHOULDER_PRESS, ARNOLD_PRESS, ALTERNATING_DUMBBELL_SHOULDER_PRESS, SEATED_DUMBBELL_SHOULDER_PRESS |
| CURL | ALTERNATING_DUMBBELL_BICEPS_CURL, BARBELL_BICEP_CURL, CABLE_BICEP_CURL, CONCENTRATION_CURL, DUMBBELL_BICEP_CURL, HAMMER_CURL, INCLINE_DUMBBELL_BICEP_CURL |
| TRICEP_EXTENSION | BENCH_DIPS, CABLE_OVERHEAD_TRICEP_EXTENSION, DUMBBELL_LYING_TRICEP_EXTENSION, SKULL_CRUSHERS, TRICEP_PUSHDOWN, TRICEP_ROPE_PUSHDOWN |
| FLYE | CABLE_CROSSOVER, DUMBBELL_FLYE, INCLINE_DUMBBELL_FLYE |
| PUSH_UP | PUSH_UP, CLOSE_GRIP_PUSH_UP, DECLINE_PUSH_UP, INCLINE_PUSH_UP, PIKE_PUSH_UP, WEIGHTED_PUSH_UP |
| PLANK | PLANK, SIDE_PLANK, WEIGHTED_PLANK, PLANK_WITH_KNEE_TO_CHEST |
| CRUNCH | CRUNCH, BICYCLE_CRUNCH, CABLE_CRUNCH, REVERSE_CRUNCH, SITUP, WEIGHTED_CRUNCH |
| HIP_RAISE | BARBELL_HIP_THRUST, GLUTE_BRIDGE, HIP_RAISE, WEIGHTED_HIP_RAISE |
| CALF_RAISE | CALF_RAISE, DONKEY_CALF_RAISE, SEATED_CALF_RAISE |
| STEP_UP | BARBELL_STEP_UPS, BODYWEIGHT_STEP_UP, DUMBBELL_STEP_UPS |
| LATERAL_RAISE | ALTERNATING_LATERAL_RAISE, DUMBBELL_LATERAL_RAISE |
| CORE | TURKISH_GET_UP, DEAD_BUG, PALLOF_PRESS |
| WARM_UP | JUMPING_JACK, MOUNTAIN_CLIMBER |


### RepeatGroupDTO (repeat blocks)
- type: "RepeatGroupDTO" (required)
- stepOrder: number (1-based within the containing steps array)
- numberOfIterations: number (how many times to repeat)
- skipLastRestStep: true — set this on strength circuits to skip the final rest after the last round
- workoutSteps: array of ExecutableStepDTO (the steps to repeat)
  - stepOrder within this array is 1-based and independent of the parent

## Notes
- NEVER use targetValueOne/targetValueTwo for heart rate zones — use zoneNumber instead.
  Using targetValueOne/targetValueTwo with heart.rate.zone target type causes Garmin to
  misinterpret the values as pace (m/s), resulting in impossible paces like ~11 sec/mile.
- RepeatGroupDTO cannot be nested inside another RepeatGroupDTO.
- All stepOrder values within the same array must be sequential starting from 1.
`;

export function registerResources(server: McpServer): void {
  for (const [name, template] of Object.entries(WORKOUT_TEMPLATES)) {
    const uri = `workout://templates/${name}`;
    server.resource(name, uri, async (resourceUri) => ({
      contents: [
        {
          uri: resourceUri.href,
          mimeType: "application/json",
          text: JSON.stringify(template, null, 2),
        },
      ],
    }));
  }

  server.resource(
    "workout-structure-reference",
    "workout://reference/structure",
    async (resourceUri) => ({
      contents: [
        {
          uri: resourceUri.href,
          mimeType: "text/markdown",
          text: WORKOUT_STRUCTURE_REFERENCE,
        },
      ],
    })
  );
}
