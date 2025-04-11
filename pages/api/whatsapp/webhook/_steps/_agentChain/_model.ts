import { GoogleGenerativeAI } from "@google/generative-ai";
import { modelName } from "../../_constants";

export const _model = () => {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({
    model: modelName,
  });

  return model;
};
