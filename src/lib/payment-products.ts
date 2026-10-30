export const paymentProducts = {
  license: { title: 'Licença TuneAssist (6 meses)', price: 149 },
  renewal: { title: 'Renovação TuneAssist (6 meses)', price: 149 },
  credits: { title: 'Pacote de 10 créditos', price: 198 },
} as const;
export type PaymentType = keyof typeof paymentProducts;

