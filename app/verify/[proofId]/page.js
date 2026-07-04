import VerifyProofClient from "../../components/VerifyProofClient";

export default async function Page({ params }) {
  const { proofId } = await params;
  return <VerifyProofClient proofId={proofId} />;
}
