import logger from "@/lib/logger";
import { NextApiRequest, NextApiResponse } from "next";

export const _adminFlow = async (req: NextApiRequest, res: NextApiResponse) => {
  const payload = req.body;

  if (payload.message.fromMe) {
    logger.debug("Ignoring own message", {
      chatId: payload.message.chatid,
    });
    return res.status(200).json({ status: "ignored", reason: "own message" });
  }
};
