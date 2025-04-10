export const injectPromptCurrentDate = () =>
  `Hoje é dia ${new Date().toLocaleDateString("pt-BR")}, ${new Date().toLocaleTimeString("pt-BR")}  `;
