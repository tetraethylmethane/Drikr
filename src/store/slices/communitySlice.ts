import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { CommunityPost } from '../../types';

/**
 * Farmer-to-farmer knowledge sharing (the deck's "Community Learning & Feedback").
 *
 * Posts are local-first: they are written to the store immediately and queued in the
 * outbox for sync, so a farmer with no signal can still record what worked.
 */

interface CommunityState {
  posts: CommunityPost[];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const initialState: CommunityState = {
  posts: [
    {
      id: 'seed-1',
      author: 'Ramesh K.',
      district: 'Coimbatore',
      crop: 'Maize',
      text: 'Fall armyworm showed up in my Plot 2 last week. Neem spray at dusk for three evenings pulled it right down. Spray late, not at noon.',
      at: Date.now() - 3 * HOUR,
      likes: 14,
      replies: [
        {
          id: 'seed-1-r1',
          author: 'Lakshmi S.',
          text: 'Same here. Adding a little soap to the mix helps it stick to the leaf.',
          at: Date.now() - 2 * HOUR,
        },
      ],
    },
    {
      id: 'seed-2',
      author: 'Anil Patil',
      district: 'Nashik',
      crop: 'Cotton',
      text: 'Drip + the app moisture alerts cut my watering from every 3 days to every 5. Same growth, far less pumping cost.',
      at: Date.now() - 26 * HOUR,
      likes: 31,
      replies: [],
    },
    {
      id: 'seed-3',
      author: 'Sunita Devi',
      district: 'Rohtas',
      crop: 'Wheat',
      text: 'Yellow rust warning came two days before I could see anything on the leaves. Sprayed early and saved the crop.',
      at: Date.now() - 50 * HOUR,
      likes: 22,
      replies: [],
    },
  ],
};

const CAP = 200;

const communitySlice = createSlice({
  name: 'community',
  initialState,
  reducers: {
    addPost: (state, action: PayloadAction<CommunityPost>) => {
      state.posts = [action.payload, ...state.posts].slice(0, CAP);
    },
    toggleLike: (state, action: PayloadAction<string>) => {
      const p = state.posts.find((x) => x.id === action.payload);
      if (!p) return;
      p.likedByMe = !p.likedByMe;
      p.likes += p.likedByMe ? 1 : -1;
    },
    addReply: (
      state,
      action: PayloadAction<{ postId: string; author: string; text: string }>
    ) => {
      const p = state.posts.find((x) => x.id === action.payload.postId);
      if (!p) return;
      p.replies.push({
        id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        author: action.payload.author,
        text: action.payload.text,
        at: Date.now(),
      });
    },
  },
});

export const { addPost, toggleLike, addReply } = communitySlice.actions;
export default communitySlice.reducer;
