// pages/api/whatsapp/webhook/[...events].ts
import type { NextApiRequest, NextApiResponse } from "next";
import { checkAvailableTimes } from "@/services/appointment";
import { DateTime } from "luxon";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  const testes = [];

  const dateStr = "2024-05-21";
  const dayName = DateTime.fromFormat(dateStr, "yyyy-LL-dd")
    .setLocale("en")
    .toFormat("cccc")
    .toLowerCase();

  const availableTimes = await checkAvailableTimes(
    "business0",
    "2024-05-21",
    "Corte de Cabelo",
  );

  testes.push({
    dateStr,
    dayName,
    availableTimes,
  });

  res.status(200).json({ testes });
}

export const config = {
  api: {
    bodyParser: true,
  },
};
