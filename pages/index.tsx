import { useState } from "react";
import Head from "next/head";

export default function AdminPage() {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, string>>({});

  const handleAction = async (action: string, endpoint: string) => {
    try {
      setLoading((prev) => ({ ...prev, [action]: true }));
      setResults((prev) => ({ ...prev, [action]: "Processando..." }));

      const response = await fetch(`/api/admin/${endpoint}`, {
        method: "POST",
      });

      const data = await response.json();

      setResults((prev) => ({
        ...prev,
        [action]: data.success
          ? `✅ Sucesso: ${data.message}`
          : `❌ Erro: ${data.error || "Ocorreu um erro desconhecido"}`,
      }));
    } catch (error) {
      setResults((prev) => ({
        ...prev,
        [action]: `❌ Erro: ${error instanceof Error ? error.message : "Ocorreu um erro desconhecido"}`,
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [action]: false }));
    }
  };

  const actions = [
    {
      id: "clearCache",
      label: "Limpar todo o cache do Redis",
      endpoint: "clear-redis",
      description: "Remove todas as chaves armazenadas no Redis",
    },
    {
      id: "clearConversations",
      label: "Limpar histórico de conversas",
      endpoint: "clear-conversations",
      description: "Remove todos os registros de conversas do Supabase",
    },
    {
      id: "clearSessions",
      label: "Limpar sessões ativas",
      endpoint: "clear-sessions",
      description: "Remove todas as sessões ativas no Redis",
    },
    {
      id: "clearAppointments",
      label: "Limpar agendamentos",
      endpoint: "clear-appointments",
      description: "Remove todos os agendamentos futuros",
    },
    {
      id: "clearLogs",
      label: "Limpar logs do sistema",
      endpoint: "clear-logs",
      description: "Remove todos os logs armazenados no Supabase",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <Head>
        <title>Admin - UazapiGo</title>
        <meta name="description" content="Painel de administração UazapiGo" />
      </Head>

      <main className="container mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold text-center mb-8">
          Painel de Administração
        </h1>

        <div className="bg-white rounded-lg shadow p-6 max-w-4xl mx-auto">
          <h2 className="text-xl font-semibold mb-4">
            Operações de Manutenção
          </h2>
          <p className="text-red-600 mb-6 font-bold">
            ⚠️ Atenção: Estas operações são irreversíveis!
          </p>

          <div className="space-y-6">
            {actions.map((action) => (
              <div key={action.id} className="border p-4 rounded-lg">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-lg">{action.label}</h3>
                    <p className="text-gray-600 text-sm">
                      {action.description}
                    </p>
                  </div>

                  <button
                    onClick={() => handleAction(action.id, action.endpoint)}
                    disabled={loading[action.id]}
                    className={`px-4 py-2 rounded-md ${
                      loading[action.id]
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-red-600 hover:bg-red-700 text-white"
                    } transition-colors`}
                  >
                    {loading[action.id] ? "Processando..." : "Executar"}
                  </button>
                </div>

                {results[action.id] && (
                  <div
                    className={`mt-2 p-2 rounded ${
                      results[action.id]?.startsWith("✅")
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {results[action.id]}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
