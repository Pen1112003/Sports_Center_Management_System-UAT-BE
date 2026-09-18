export const openapiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Sports Center Management System API',
    version: '0.1.0',
    description: 'API cho xác thực và đăng ký lớp học của Sports Center Management System.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
  tags: [
    { name: 'Health', description: 'Service status' },
    { name: 'Authentication', description: 'Đăng nhập và quản lý session' },
    { name: 'Class registration', description: 'Danh sách và đăng ký lớp học cho member' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { code: { type: 'string' }, message: { type: 'string' } },
        required: ['code', 'message'],
      },
      LoginRequest: {
        type: 'object',
        required: ['identifier', 'password'],
        properties: { identifier: { type: 'string', example: 'member@sports-center.local' }, password: { type: 'string', format: 'password', example: 'ChangeMe123!' } },
      },
      ClassSchedule: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, courseName: { type: 'string' }, classDate: { type: 'string', format: 'date-time' },
          startTime: { type: 'string', format: 'date-time' }, endTime: { type: 'string', format: 'date-time' },
          room: { type: 'string' }, capacity: { type: 'integer' }, availableSlots: { type: 'integer' },
        },
      },
      RegistrationRequest: { type: 'object', required: ['classId'], properties: { classId: { type: 'integer', minimum: 1, example: 1 } } },
      Registration: {
        type: 'object',
        properties: { id: { type: 'integer' }, classId: { type: 'integer' }, status: { type: 'string', example: 'CONFIRMED' }, registeredAt: { type: 'string', format: 'date-time' } },
      },
    },
  },
  paths: {
    '/health': {
      get: { tags: ['Health'], summary: 'Kiểm tra trạng thái API', responses: { '200': { description: 'API đang hoạt động' } } },
    },
    '/api/auth/login': {
      post: {
        tags: ['Authentication'], summary: 'Đăng nhập', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
        responses: { '200': { description: 'Đăng nhập thành công' }, '401': { description: 'Sai thông tin đăng nhập', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }, '422': { description: 'Dữ liệu không hợp lệ' } },
      },
    },
    '/api/auth/refresh': {
      post: { tags: ['Authentication'], summary: 'Refresh access token', responses: { '200': { description: 'Token mới' }, '401': { description: 'Refresh token không hợp lệ' } } },
    },
    '/api/auth/logout': {
      post: { tags: ['Authentication'], summary: 'Đăng xuất', responses: { '204': { description: 'Đăng xuất thành công' } } },
    },
    '/api/auth/me': {
      get: { tags: ['Authentication'], summary: 'Lấy session hiện tại', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Thông tin session' }, '401': { description: 'Chưa đăng nhập' } } },
    },
    '/api/classes': {
      get: { tags: ['Class registration'], summary: 'Lấy các lớp đang mở', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Danh sách lớp', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ClassSchedule' } } } } }, '401': { description: 'Chưa đăng nhập' }, '403': { description: 'Chỉ member được truy cập' } } },
    },
    '/api/class-registrations': {
      post: {
        tags: ['Class registration'], summary: 'Đăng ký lớp học', description: 'Kiểm tra gói tập còn hiệu lực, không trùng lịch và còn slot.', security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RegistrationRequest' } } } },
        responses: { '201': { description: 'Đăng ký thành công', content: { 'application/json': { schema: { $ref: '#/components/schemas/Registration' } } } }, '403': { description: 'Gói tập hết hạn hoặc không đủ quyền' }, '409': { description: 'Lớp đầy, trùng lịch hoặc đã đăng ký' }, '422': { description: 'Dữ liệu không hợp lệ' } },
      },
    },
  },
} as const
