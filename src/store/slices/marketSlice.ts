import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface PriceData {
  date: string;
  price: number;
}

interface CropPrice {
  cropName: string;
  cropNameTamil: string;
  currentPrice: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  history: PriceData[];
}

interface MarketState {
  prices: CropPrice[];
  loading: boolean;
  lastUpdated: string | null;
}

const initialState: MarketState = {
  prices: [],
  loading: false,
  lastUpdated: null,
};

const marketSlice = createSlice({
  name: 'market',
  initialState,
  reducers: {
    setPrices: (state, action: PayloadAction<CropPrice[]>) => {
      state.prices = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setLastUpdated: (state, action: PayloadAction<string>) => {
      state.lastUpdated = action.payload;
    },
  },
});

export const { setPrices, setLoading, setLastUpdated } = marketSlice.actions;
export default marketSlice.reducer;

