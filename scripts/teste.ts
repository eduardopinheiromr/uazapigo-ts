import {
  checkAvailableDates,
  checkAvailableTimes,
} from "@/services/appointment";
import { DateTime } from "luxon";

const dateStr = "2024-05-21";
const dayName = DateTime.fromFormat(dateStr, "yyyy-LL-dd")
  .setLocale("en")
  .toFormat("cccc")
  .toLowerCase();

checkAvailableTimes("business0", "2024-05-21", "Corte de Cabelo").then(
  (resultTimes) => {
    console.log({
      dateStr,
      dayName,
      resultTimes,
    });
  },
);

// const resultDates = await checkAvailableDates(
//   "business0",
//   "2024-05-21",
//   "Corte de Cabelo",
// )
