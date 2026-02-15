import { configureStore } from '@reduxjs/toolkit';
import languageReducer from './slices/languageSlice';
import userReducer from './slices/userSlice';
import cropReducer from './slices/cropSlice';
import marketReducer from './slices/marketSlice';
import locationReducer from './slices/locationSlice';

export const store = configureStore({
  reducer: {
    language: languageReducer,
    user: userReducer,
    crop: cropReducer,
    market: marketReducer,
  location: locationReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

