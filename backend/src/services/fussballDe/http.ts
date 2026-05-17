import axios, { type AxiosInstance } from 'axios';

export const createHttpClient = (timeoutMs = 10000): AxiosInstance => {
  return axios.create({
    timeout: timeoutMs,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
};
