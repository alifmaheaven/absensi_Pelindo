import axios from '@/lib/axios';
import { IMeta, IPermission, IUser, Response } from '@/types';

export async function getCaptcha(): Promise<Response<{ svg: string; token: string }>> {
  try {
    const res = await axios.get('/auth/captcha');
    return res.data;
  } catch (error) {
    throw error;
  }
}

export async function login(payload: {
  email: string;
  password: string;
  captcha_token: string;
  captcha_answer: string;
}): Promise<Response<{ token: string }>> {
  try {
    const res = await axios.post('/auth/login', payload);

    return res.data;
  } catch (error) {
    throw error;
  }
}

export async function getProfile(): Promise<Response<IUser>> {
  try {
    const res = await axios.get('/auth/profile');

    return res.data;
  } catch (error) {
    console.error('getProfile');
    throw error;
  }
}

export async function getPermission(): Promise<
  Response<{
    meta: IMeta;
    data: IPermission[];
  }>
> {
  try {
    const res = await axios.get('/permission');

    return res.data;
  } catch (error) {
    console.error('getPermission');
    throw error;
  }
}
