import { writable } from 'svelte/store';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '$lib/services/supabase';

export const user = writable<User | null>(null);
export const session = writable<Session | null>(null);
export const loading = writable(true);

// Initialize auth state
supabase.auth.getSession().then(({ data }) => {
	session.set(data.session);
	user.set(data.session?.user ?? null);
	loading.set(false);
});

// Listen for auth changes
supabase.auth.onAuthStateChange((_event, newSession) => {
	session.set(newSession);
	user.set(newSession?.user ?? null);
	loading.set(false);
});

export async function signUp(email: string, password: string) {
	const { data, error } = await supabase.auth.signUp({
		email,
		password
	});
	return { data, error };
}

export async function signIn(email: string, password: string) {
	const { data, error } = await supabase.auth.signInWithPassword({
		email,
		password
	});
	return { data, error };
}

export async function signOut() {
	const { error } = await supabase.auth.signOut();
	return { error };
}

export async function resetPasswordForEmail(email: string) {
	const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
		redirectTo: `${window.location.origin}/auth/reset-password`
	});
	return { data, error };
}

export async function updatePassword(newPassword: string) {
	const { data, error } = await supabase.auth.updateUser({
		password: newPassword
	});
	return { data, error };
}

export async function signInWithGoogle() {
	const { data, error } = await supabase.auth.signInWithOAuth({
		provider: 'google',
		options: {
			redirectTo: `${window.location.origin}/auth/callback`
		}
	});
	return { data, error };
}
