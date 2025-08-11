/**
 * Axios API client for the Flashcards app.
 * Falls back to localhost if VITE_API_URL isn't set.
 */
import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8080",
});