import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface LocationState {
  stateName: string | null;
  districtName: string | null;
}

const initialState: LocationState = {
  stateName: null,
  districtName: null,
};

const locationSlice = createSlice({
  name: 'location',
  initialState,
  reducers: {
    setStateName: (s, a: PayloadAction<string | null>) => {
      s.stateName = a.payload;
      // reset district when state changes
      if (a.payload === null) s.districtName = null;
    },
    setDistrictName: (s, a: PayloadAction<string | null>) => {
      s.districtName = a.payload;
    },
  },
});

export const { setStateName, setDistrictName } = locationSlice.actions;
export default locationSlice.reducer;
