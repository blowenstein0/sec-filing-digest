import SignupForm from "@/components/signup/SignupForm";

export default function SignupPage() {
  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900 text-center">
        SEC Filing Digest
      </h1>
      <p className="mt-2 text-gray-600 text-center">
        AI-summarized SEC filing alerts, delivered to your inbox.
      </p>

      <div className="mt-8 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <SignupForm />
      </div>
    </div>
  );
}
