import { screen, within } from "@testing-library/react-native";

/**
 * The sheet a title opens, and only that sheet.
 *
 * The screen under a sheet carries buttons with the same words — Edit, Move,
 * Share — and a claim about a menu or a sheet is about the menu or the sheet.
 * Its title is its one header, and the sheet is the view two levels up.
 */
export const theSheetCalled = async (title: string): Promise<ReturnType<typeof within>> => {
  const header = await screen.findByRole("header", { name: title });
  const sheet = header.parent?.parent;
  if (sheet === null || sheet === undefined) {
    throw new Error(`No sheet around the title ${title}`);
  }

  return within(sheet);
};
