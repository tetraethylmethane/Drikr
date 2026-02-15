import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface CropData {
  n: string;
  p: string;
  k: string;
  temperature: string;
  humidity: string;
  ph: string;
  rainfall: string;
}

interface CropRecommendation {
  cropName: string;
  cropNameTamil: string;
  confidence: number;
  image?: string;
  description: string;
  descriptionTamil: string;
}

interface CropState {
  inputData: CropData;
  recommendation: CropRecommendation | null;
  loading: boolean;
}

const initialState: CropState = {
  inputData: {
    n: '',
    p: '',
    k: '',
    temperature: '',
    humidity: '',
    ph: '',
    rainfall: '',
  },
  recommendation: null,
  loading: false,
};

const cropSlice = createSlice({
  name: 'crop',
  initialState,
  reducers: {
    setInputData: (state, action: PayloadAction<CropData>) => {
      state.inputData = action.payload;
    },
    setRecommendation: (state, action: PayloadAction<CropRecommendation | null>) => {
      state.recommendation = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const { setInputData, setRecommendation, setLoading } = cropSlice.actions;
export default cropSlice.reducer;

