export const ErrorCode = {
  SUCCESS: 0,
  VALIDATION_FAILED: 40001,
  INVALID_CREDENTIALS: 40101,
  USER_DISABLED: 40102,
  TOKEN_EXPIRED: 40103,
  TOKEN_INVALID: 40104,
  TOKEN_REVOKED: 40105,
  TOKEN_REUSE_DETECTED: 40106,
  USER_ALREADY_EXISTS: 40901,
  INTERNAL_SERVER_ERROR: 50001,
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ErrorMessages: Record<ErrorCodeType, string> = {
  [ErrorCode.SUCCESS]: 'success',
  [ErrorCode.VALIDATION_FAILED]: '请求参数校验失败',
  [ErrorCode.INVALID_CREDENTIALS]: '用户名/邮箱或密码错误',
  [ErrorCode.USER_DISABLED]: '用户账号已被封禁或注销',
  [ErrorCode.TOKEN_EXPIRED]: 'Access Token 已过期',
  [ErrorCode.TOKEN_INVALID]: 'Token 签名非法或格式无效',
  [ErrorCode.TOKEN_REVOKED]: 'Token 已被注销或列入黑名单',
  [ErrorCode.TOKEN_REUSE_DETECTED]: '检测到已作废的 Refresh Token 重放，触发安全防护清除全量会话',
  [ErrorCode.USER_ALREADY_EXISTS]: '用户名或邮箱已被注册占用',
  [ErrorCode.INTERNAL_SERVER_ERROR]: '服务器内部未知异常',
};
