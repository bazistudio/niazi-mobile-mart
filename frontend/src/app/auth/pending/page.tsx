import Link from "next/link";

export default function PendingApprovalPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Pending Approval</h1>
      <p className="text-gray-600 max-w-md mb-8">
        Your account registration was successful and is currently awaiting Super Admin approval. 
        You will be able to log in and access your dashboard once it is approved.
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
