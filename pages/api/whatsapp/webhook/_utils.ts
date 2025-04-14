export const injectPromptCurrentDate = () =>
  `Hoje é dia ${new Date().toLocaleDateString("pt-BR")}, ${new Date().toLocaleTimeString("pt-BR")}  `;

export const serializeLlmResponse = (response: string = "") => {
  // deve remover o ```json do início e ``` do final
  // e retornar um JSON válido
  const match = response.match(/```json([\s\S]*)```/);
  if (!match) {
    return response;
  }
  const jsonStr = match[1];

  return jsonStr;
};
