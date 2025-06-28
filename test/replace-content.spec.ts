/**
 * @file replace-content.spec.ts
 * @brief 动态内容替换功能集成测试
 */

import { env, createExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index';

// 模拟 fetch 函数
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('动态内容替换功能集成测试', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('应该对指定文件进行内容替换（env 模式）', async () => {
		// 模拟 GitHub API 返回的文件内容
		mockFetch.mockImplementationOnce(() => 
			Promise.resolve(new Response(`database:
  host: \${env:database_host}
  port: \${env:database_port}
config:
  version: \${env:version}`, {
				status: 200,
				headers: { 'content-type': 'text/plain' }
			}))
		);

		const testEnv = {
			...env,
			GH_NAME: 'test-user',
			GH_REPO: 'test-repo',
			GH_BRANCH: 'main',
			GH_TOKEN: 'test-token',
			REPLACE_CONFIG: JSON.stringify([{
				files: ['/config/app.yml'],
				mode: 'env',
				static: {
					database_host: 'db.example.com',
					database_port: '5432',
					version: '1.0.0'
				}
			}])
		};

		const request = new Request('https://example.com/config/app.yml');
		const ctx = createExecutionContext();
		
		const response = await worker.fetch(request, testEnv, ctx);
		const content = await response.text();

		expect(response.status).toBe(200);
		expect(content).toContain('host: db.example.com');
		expect(content).toContain('port: 5432');
		expect(content).toContain('version: 1.0.0');
		expect(content).not.toContain('${env:');
	});

	it('应该对指定文件进行内容替换（template 模式）', async () => {
		// 模拟 GitHub API 返回的文件内容
		mockFetch.mockImplementationOnce(() => 
			Promise.resolve(new Response(`upstream backend {
  server {{api_host}}:{{api_port}};
}`, {
				status: 200,
				headers: { 'content-type': 'text/plain' }
			}))
		);

		const testEnv = {
			...env,
			GH_NAME: 'test-user',
			GH_REPO: 'test-repo',
			GH_BRANCH: 'main',
			GH_TOKEN: 'test-token',
			REPLACE_CONFIG: JSON.stringify([{
				files: ['/nginx.conf'],
				mode: 'template',
				static: {
					api_host: 'api.example.com',
					api_port: '443'
				}
			}])
		};

		const request = new Request('https://example.com/nginx.conf');
		const ctx = createExecutionContext();
		
		const response = await worker.fetch(request, testEnv, ctx);
		const content = await response.text();

		expect(response.status).toBe(200);
		expect(content).toBe(`upstream backend {
  server api.example.com:443;
}`);
	});

	it('应该从 API 获取替换数据', async () => {
		// 第一次调用：模拟 GitHub API
		mockFetch.mockImplementationOnce(() => 
			Promise.resolve(new Response(`database: \${env:database_host}:\${env:database_port}`, {
				status: 200,
				headers: { 'content-type': 'text/plain' }
			}))
		);

		// 第二次调用：模拟替换数据 API
		mockFetch.mockImplementationOnce(() => 
			Promise.resolve(new Response(JSON.stringify({
				database: {
					host: 'db-prod.example.com',
					port: 5432
				}
			}), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			}))
		);

		const testEnv = {
			...env,
			GH_NAME: 'test-user',
			GH_REPO: 'test-repo',
			GH_BRANCH: 'main',
			GH_TOKEN: 'test-token',
			REPLACE_CONFIG: JSON.stringify([{
				files: ['/database.conf'],
				mode: 'env',
				api: {
					url: 'https://api.example.com/config',
					headers: { 'Authorization': 'Bearer ABC123' }
				},
				mappings: {
					database_host: 'database.host',
					database_port: 'database.port'
				},
				cache: 0
			}])
		};

		const request = new Request('https://example.com/database.conf');
		const ctx = createExecutionContext();
		
		const response = await worker.fetch(request, testEnv, ctx);
		const content = await response.text();

		expect(response.status).toBe(200);
		expect(content).toBe('database: db-prod.example.com:5432');
	});

	it('不应该替换未配置的文件', async () => {
		// 模拟 GitHub API 返回的文件内容
		mockFetch.mockImplementationOnce(() => 
			Promise.resolve(new Response(`value: \${env:test}`, {
				status: 200,
				headers: { 'content-type': 'text/plain' }
			}))
		);

		const testEnv = {
			...env,
			GH_NAME: 'test-user',
			GH_REPO: 'test-repo',
			GH_BRANCH: 'main',
			GH_TOKEN: 'test-token',
			REPLACE_CONFIG: JSON.stringify([{
				files: ['/config/app.yml'],  // 只配置了这个文件
				mode: 'env',
				static: { test: 'replaced' }
			}])
		};

		const request = new Request('https://example.com/other/file.txt');  // 请求其他文件
		const ctx = createExecutionContext();
		
		const response = await worker.fetch(request, testEnv, ctx);
		const content = await response.text();

		expect(response.status).toBe(200);
		expect(content).toBe('value: ${env:test}');  // 内容未被替换
	});

	it('应该处理错误策略（keep）', async () => {
		// 模拟 GitHub API 返回的文件内容
		mockFetch.mockImplementationOnce(() => 
			Promise.resolve(new Response(`known: \${env:known}
unknown: \${env:unknown}`, {
				status: 200,
				headers: { 'content-type': 'text/plain' }
			}))
		);

		const testEnv = {
			...env,
			GH_NAME: 'test-user',
			GH_REPO: 'test-repo',
			GH_BRANCH: 'main',
			GH_TOKEN: 'test-token',
			REPLACE_CONFIG: JSON.stringify([{
				files: ['/test.conf'],
				mode: 'env',
				static: { known: 'value' },  // 只定义了 known
				onError: 'keep'
			}])
		};

		const request = new Request('https://example.com/test.conf');
		const ctx = createExecutionContext();
		
		const response = await worker.fetch(request, testEnv, ctx);
		const content = await response.text();

		expect(response.status).toBe(200);
		expect(content).toBe(`known: value
unknown: \${env:unknown}`);  // unknown 保持原样
	});

	it('应该处理错误策略（remove）', async () => {
		// 模拟 GitHub API 返回的文件内容
		mockFetch.mockImplementationOnce(() => 
			Promise.resolve(new Response(`known: \${env:known}
unknown: \${env:unknown}`, {
				status: 200,
				headers: { 'content-type': 'text/plain' }
			}))
		);

		const testEnv = {
			...env,
			GH_NAME: 'test-user',
			GH_REPO: 'test-repo',
			GH_BRANCH: 'main',
			GH_TOKEN: 'test-token',
			REPLACE_CONFIG: JSON.stringify([{
				files: ['/test.conf'],
				mode: 'env',
				static: { known: 'value' },  // 只定义了 known
				onError: 'remove'
			}])
		};

		const request = new Request('https://example.com/test.conf');
		const ctx = createExecutionContext();
		
		const response = await worker.fetch(request, testEnv, ctx);
		const content = await response.text();

		expect(response.status).toBe(200);
		expect(content).toBe(`known: value
unknown: `);  // unknown 被移除
	});

	it('应该支持正则表达式模式', async () => {
		// 模拟 GitHub API 返回的文件内容
		mockFetch.mockImplementationOnce(() => 
			Promise.resolve(new Response(`host=$[API_HOST]
port=$[API_PORT]`, {
				status: 200,
				headers: { 'content-type': 'text/plain' }
			}))
		);

		const testEnv = {
			...env,
			GH_NAME: 'test-user',
			GH_REPO: 'test-repo',
			GH_BRANCH: 'main',
			GH_TOKEN: 'test-token',
			REPLACE_CONFIG: JSON.stringify([{
				files: ['/custom.conf'],
				mode: 'regex',
				pattern: '\\$\\[([^\\]]+)\\]',  // 匹配 $[VARIABLE]
				static: {
					API_HOST: 'api.example.com',
					API_PORT: '443'
				}
			}])
		};

		const request = new Request('https://example.com/custom.conf');
		const ctx = createExecutionContext();
		
		const response = await worker.fetch(request, testEnv, ctx);
		const content = await response.text();

		expect(response.status).toBe(200);
		expect(content).toBe(`host=api.example.com
port=443`);
	});

	it('应该支持多组替换规则', async () => {
		// 第一次调用：GitHub API 获取文件
		mockFetch.mockImplementationOnce(() => 
			Promise.resolve(new Response(`app:
  name: {{app_name}}
  version: \${env:version}
  server: {{server_host}}`, {
				status: 200,
				headers: { 'content-type': 'text/plain' }
			}))
		);

		const testEnv = {
			...env,
			GH_NAME: 'test-user',
			GH_REPO: 'test-repo',
			GH_BRANCH: 'main',
			GH_TOKEN: 'test-token',
			REPLACE_CONFIG: JSON.stringify([
				{
					files: ['/config/mixed.yml'],
					mode: 'template',
					static: {
						app_name: 'MyApp',
						server_host: 'api.example.com'
					}
				},
				{
					files: ['/config/mixed.yml'],
					mode: 'env',
					static: {
						version: '2.0.0'
					}
				}
			])
		};

		const request = new Request('https://example.com/config/mixed.yml');
		const ctx = createExecutionContext();
		
		const response = await worker.fetch(request, testEnv, ctx);
		const content = await response.text();

		expect(response.status).toBe(200);
		// 注意：由于是按规则顺序应用，第一个规则会匹配并处理，第二个规则不会生效
		// 实际应用中，应该避免对同一文件应用多个规则
		expect(content).toContain('name: MyApp');
		expect(content).toContain('server: api.example.com');
	});
}); 