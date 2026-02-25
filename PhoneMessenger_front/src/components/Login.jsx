import React from 'react';
import axios from 'axios';
import { useNavigate } from "react-router-dom";

function Login() {
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault(); 
    const { email, password } = e.target.elements;
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/login`, {
        email: email.value,
        password: password.value,
      });
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('userId', response.data.user.id);
      alert('Login successful!');
      navigate("/home");
      window.location.reload();
    } catch (error) {
      alert('Login failed: ' + (error.response?.data?.error || error.message));
    }   
  };

  return (
    <div className='dark:text-white p-4 max-w-md mx-auto mt-10 border rounded bg-white dark:bg-gray-800'>
      <form onSubmit={handleLogin} className=' flex flex-col gap-4'>   
        <h2 className='text-black text-2xl font-semibold'>Login</h2>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col'>
            <label className='flex justify-start text-black'>Email:</label>
            <input className="bg-gray-300 text-black" type="email" name="email" required />
          </div>
          <div className='flex flex-col'>
            <label className="flex justify-start text-black">Password:</label>
            <input className="bg-gray-300 text-black" type="password" name="password" required />
          </div>
        </div>
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">Login</button>
        <p className="text-black text-sm">
          Don't have an account? <a href="/register" className="text-blue-600 hover:underline">Register here</a>
        </p>
      </form>
    </div>
  );
}

export default Login;