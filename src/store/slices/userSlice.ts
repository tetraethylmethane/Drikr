import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { UserProfile } from '../../types';

interface UserState {
  profile: UserProfile | null;
  isAuthenticated: boolean;
  /** Null until the stored session has been checked on launch. */
  sessionChecked: boolean;
}

const initialState: UserState = {
  profile: null,
  isAuthenticated: false,
  sessionChecked: false,
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    signIn: (state, action: PayloadAction<UserProfile>) => {
      state.profile = action.payload;
      state.isAuthenticated = true;
      state.sessionChecked = true;
    },
    updateProfile: (state, action: PayloadAction<Partial<UserProfile>>) => {
      if (state.profile) Object.assign(state.profile, action.payload);
    },
    sessionChecked: (state) => {
      state.sessionChecked = true;
    },
    signOut: (state) => {
      state.profile = null;
      state.isAuthenticated = false;
      state.sessionChecked = true;
    },
  },
});

export const { signIn, updateProfile, sessionChecked, signOut } = userSlice.actions;
export default userSlice.reducer;
