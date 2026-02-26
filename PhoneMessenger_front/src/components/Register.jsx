import React from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function Register() {
  const navigate = useNavigate();
  
  const handleRegister = async (e) => {
    e.preventDefault();
    const { name, email, password } = e.target.elements;
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/register`, {
        name: name.value,
        email: email.value,
        password: password.value,
      });
      alert('Registration successful! Redirecting to login...');
      navigate('/login');
    } catch (error) {
      alert('Registration failed: ' + (error.response?.data?.error || error.message));
    }
  };  

  return (
    <div className='dark:text-white p-4 max-w-md mx-auto mt-10 border rounded bg-white dark:bg-gray-800'>
      <form onSubmit={handleRegister} className=' flex flex-col gap-4'>
        <h2 className='text-white text-2xl font-semibold'>Register</h2>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col'>
            <label className='flex justify-start text-white'>Name:</label>
            <input className="bg-gray-300 text-black" type="text" name="name" required />
          </div>
          <div className='flex flex-col'>
            <label className='flex justify-start text-white'>Email:</label>
            <input className="bg-gray-300 text-black" type="email" name="email" required />
          </div>
          <div className='flex flex-col'>
            <label className='flex justify-start text-white'>Password:</label>
            <input className="bg-gray-300 text-black" type="password" name="password" required />
          </div>
        </div>
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">Register</button>
        <p className="text-white text-sm">
          Already have an account? <a href="/login" className="text-blue-600 hover:underline">Login here</a>
        </p>
      </form>
    </div>
  );
}

export default Register;