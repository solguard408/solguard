import ServiceDetailPage from "../../components/ServiceDetailPage";

export async function generateStaticParams() {
  return [
    { serviceId: "openclaw-ai-agent-verification" },
    { serviceId: "private-data-verification" },
    { serviceId: "quantum-cryptography-verification" },
    { serviceId: "solana-token-verification" },
    { serviceId: "smart-contract-audit" },
    { serviceId: "wallet-verification" },
    { serviceId: "dapp-frontend-verification" },
    { serviceId: "cyber-consultant" },
  ];
}

export default async function Page({ params }) {
  const { serviceId } = await params;
  return <ServiceDetailPage key={serviceId} serviceId={serviceId} />;
}
