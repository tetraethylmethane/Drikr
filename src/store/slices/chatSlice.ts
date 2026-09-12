import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ChatMessage } from '../../types';

interface ChatState {
  messages: ChatMessage[];
  thinking: boolean;
}

const CAP = 60;

const initialState: ChatState = {
  messages: [],
  thinking: false,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<ChatMessage>) => {
      state.messages = [...state.messages, action.payload].slice(-CAP);
    },
    setThinking: (state, action: PayloadAction<boolean>) => {
      state.thinking = action.payload;
    },
    clearChat: (state) => {
      state.messages = [];
      state.thinking = false;
    },
  },
});

export const { addMessage, setThinking, clearChat } = chatSlice.actions;
export default chatSlice.reducer;
