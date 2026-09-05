import Link from "next/link";

export default function RejectedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Registration Rejected</h1>
      <p className="text-gray-600 max-w-md mb-8">
        We're sorry, but your account registration was rejected by the administration team.
        If you believe this was a mistake, please contact support.
      </p>
      <Link 
        href="/auth/login" 
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
      >
        Back to Login
      </Link>
    </div>
  );
}
