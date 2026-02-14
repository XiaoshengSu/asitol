// API基础URL
const API_BASE_URL = 'http://localhost:8080/api';

// 通用请求函数
const request = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
};

// 文件上传请求函数
const uploadFile = async <T>(
  endpoint: string,
  file: File,
  additionalData?: Record<string, any>
): Promise<T> => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('File upload failed:', error);
    throw error;
  }
};

// API请求方法
export const api = {
  // GET请求
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  
  // POST请求
  post: <T>(endpoint: string, data: any) => 
    request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  // PUT请求
  put: <T>(endpoint: string, data: any) => 
    request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  // DELETE请求
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
  
  // 文件上传
  upload: <T>(endpoint: string, file: File, additionalData?: Record<string, any>) => 
    uploadFile<T>(endpoint, file, additionalData),
};
