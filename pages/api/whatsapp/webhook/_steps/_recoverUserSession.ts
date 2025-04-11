import { businessIdMap } from "@/lib/uazapiGoClient";
import { getSession } from "@/lib/utils";

export const _recoverUserSession = async (payload) => {
  const { businessId, baseUrl } = businessIdMap[payload.token];
  const userPhone = payload.message.sender.split("@")[0];
  const session = await getSession(businessId, userPhone);

  session.conversation_history.push({
    role: "user",
    content: payload.message.text,
    timestamp: Date.now(),
  });

  return { businessId, userPhone, session };
};
