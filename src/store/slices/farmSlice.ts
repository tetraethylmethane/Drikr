import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { SEED_NODES, SEED_PLOTS, seedNodesForPlot } from '../../services/simulator/seed';
import { Plot, SensorNode } from '../../types';

interface FarmState {
  plots: Plot[];
  nodes: SensorNode[];
  selectedPlotId: string | null;
  /** True until the farmer has replaced the demo farm with their own plots. */
  usingDemoFarm: boolean;
}

const initialState: FarmState = {
  plots: SEED_PLOTS,
  nodes: SEED_NODES,
  selectedPlotId: SEED_PLOTS[0]?.id ?? null,
  usingDemoFarm: true,
};

const farmSlice = createSlice({
  name: 'farm',
  initialState,
  reducers: {
    selectPlot: (state, action: PayloadAction<string>) => {
      state.selectedPlotId = action.payload;
    },
    addPlot: (state, action: PayloadAction<Plot>) => {
      // The first real plot retires the demo farm rather than mixing the two.
      if (state.usingDemoFarm) {
        state.plots = [];
        state.nodes = [];
        state.usingDemoFarm = false;
      }
      state.plots.push(action.payload);
      // A scouting field has no sensor nodes, and that absence is what keeps the
      // app honest about it: with no nodes the telemetry engine produces no
      // readings, so no screen can show a risk score for a field that has
      // nothing measuring it. Do not "helpfully" seed nodes here.
      if ((action.payload.monitoring ?? 'sensors') === 'sensors') {
        state.nodes.push(...seedNodesForPlot(action.payload));
      }
      state.selectedPlotId = action.payload.id;
    },
    updatePlot: (state, action: PayloadAction<{ id: string; changes: Partial<Plot> }>) => {
      const plot = state.plots.find((p) => p.id === action.payload.id);
      if (plot) Object.assign(plot, action.payload.changes);
    },
    removePlot: (state, action: PayloadAction<string>) => {
      state.plots = state.plots.filter((p) => p.id !== action.payload);
      state.nodes = state.nodes.filter((n) => n.plotId !== action.payload);
      if (state.selectedPlotId === action.payload) {
        state.selectedPlotId = state.plots[0]?.id ?? null;
      }
    },
    /** Records a completed survey, which resets the scouting schedule. */
    markSurveyed: (state, action: PayloadAction<{ plotId: string; at: number }>) => {
      const plot = state.plots.find((p) => p.id === action.payload.plotId);
      if (plot) plot.lastSurveyAt = action.payload.at;
    },
    setNodes: (state, action: PayloadAction<SensorNode[]>) => {
      state.nodes = action.payload;
    },
    calibrateNode: (state, action: PayloadAction<string>) => {
      const node = state.nodes.find((n) => n.id === action.payload);
      if (node) {
        node.daysSinceCalibration = 0;
        node.status = 'online';
      }
    },
    resetToDemoFarm: (state) => {
      state.plots = SEED_PLOTS;
      state.nodes = SEED_NODES;
      state.selectedPlotId = SEED_PLOTS[0]?.id ?? null;
      state.usingDemoFarm = true;
    },
  },
});

export const {
  selectPlot,
  addPlot,
  updatePlot,
  markSurveyed,
  removePlot,
  setNodes,
  calibrateNode,
  resetToDemoFarm,
} = farmSlice.actions;
export default farmSlice.reducer;
