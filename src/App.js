import React from 'react';
import { MoonPayProvider } from '@moonpay/moonpay-react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <MoonPayProvider
      publishableKey={process.env.REACT_APP_MOONPAY_PUBLISHABLE_KEY}
      environment={process.env.REACT_APP_MOONPAY_ENV}
    >
      <Router>
        <Routes>
          // ... existing code ...
        </Routes>
      </Router>
    </MoonPayProvider>
  );
}

export default App; 