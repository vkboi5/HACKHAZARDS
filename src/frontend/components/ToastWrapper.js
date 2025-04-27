import { toast } from 'react-toastify';

// Custom wrapper functions for toast to avoid defaultProps warnings with ProgressBar
export const showToast = {
  success: (message, options = {}) => {
    const defaultOptions = {
      position: 'top-center',
      autoClose: 5000,
      hideProgressBar: true, // Hide the progress bar to avoid ProgressBar defaultProps warning
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    };
    return toast.success(message, { ...defaultOptions, ...options });
  },
  
  error: (message, options = {}) => {
    const defaultOptions = {
      position: 'top-center',
      autoClose: 5000,
      hideProgressBar: true, // Hide the progress bar to avoid ProgressBar defaultProps warning
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    };
    return toast.error(message, { ...defaultOptions, ...options });
  },
  
  info: (message, options = {}) => {
    const defaultOptions = {
      position: 'top-center',
      autoClose: 5000,
      hideProgressBar: true, // Hide the progress bar to avoid ProgressBar defaultProps warning
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    };
    return toast.info(message, { ...defaultOptions, ...options });
  },
  
  warn: (message, options = {}) => {
    const defaultOptions = {
      position: 'top-center',
      autoClose: 5000,
      hideProgressBar: true, // Hide the progress bar to avoid ProgressBar defaultProps warning
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    };
    return toast.warn(message, { ...defaultOptions, ...options });
  }
};

export default showToast; 