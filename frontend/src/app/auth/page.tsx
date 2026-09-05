"use client";

import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="border p-6 rounded w-full max-w-sm">
        <h1 className="text-xl font-bold mb-4">Create Account</h1>

        <p className="text-sm text-gray-500 mb-6">
          Signup will be connected to backend later.
        </p>

        <button
          onClick={() => router.push("/auth/login")}
          className="bg-blue-600 text-white px-4 py-2 rounded w-full"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}