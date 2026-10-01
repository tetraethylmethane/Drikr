import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { CommunityPost } from '../../types';

/**
 * Farmer-to-farmer knowledge sharing.
 *
 * Two lists. `posts` is what this phone wrote, kept so a post typed in a field
 * with no signal shows at once and survives until it uploads. `remote` is the
 * shared feed from Firestore. The screen merges them by id, the server copy
 * winning once it arrives.
 *
 * There is no sample content. A community shown with invented farmers and
 * invented results would be fake testimony, and the empty state says plainly
 * that nobody has posted yet.
 */

interface CommunityState {
  posts: CommunityPost[];
  remote: CommunityPost[];
  /** Post ids this phone marked helpful. Kept on the phone. */
  liked: Record<string, boolean>;
}

const initialState: CommunityState = {
  posts: [],
  remote: [],
  liked: {},
};

const CAP = 200;

const communitySlice = createSlice({
  name: 'community',
  initialState,
  reducers: {
    addPost: (state, action: PayloadAction<CommunityPost>) => {
      // Saved state from older versions held sample posts with `seed-` ids.
      state.posts = [action.payload, ...(state.posts ?? []).filter((p) => !p.id.startsWith('seed-'))].slice(0, CAP);
    },
    setRemote: (state, action: PayloadAction<CommunityPost[]>) => {
      state.remote = action.payload;
    },
    toggleLike: (state, action: PayloadAction<string>) => {
      state.liked = state.liked ?? {};
      state.liked[action.payload] = !state.liked[action.payload];
    },
    removeLocalPost: (state, action: PayloadAction<string>) => {
      state.posts = (state.posts ?? []).filter((p) => p.id !== action.payload);
    },
  },
});

export const { addPost, setRemote, toggleLike, removeLocalPost } = communitySlice.actions;
export default communitySlice.reducer;
