/** コミュニティ入力上限（サーバー契約のクライアント複製）。 */
export const COMMUNITY_INPUT_LIMITS = {
  displayName: 12,
  loginId: 12,
  password: 20,
  postTitle: 40,
  postCaption: 500,
  comment: 200,
  reportReason: 200,
  bio: 100,
  websiteUrl: 200,
  profileTag: 15,
  profileTags: 5,
  profileTagsText: 100,
  search: 40,
  socialId: 20,
} as const;
