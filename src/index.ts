/**
 * @file index.ts
 * @brief Cloudflare Worker – GitHub Raw 文件反向代理入口
 *
 * 该 Worker 根据请求路径及环境变量，动态构建 GitHub Raw URL，
 * 携带 Token 转发至 GitHub 并返回文件内容。
 *
 * 主要环境变量:
 *  - GH_NAME      GitHub 用户或组织名
 *  - GH_REPO      仓库名
 *  - GH_BRANCH    分支名(可选，默认为主分支)
 *  - GH_TOKEN     私有仓库或加速下载所需的 GitHub Token
 *  - URL/URL302   根路径 (/) 请求时的跳转或反向代理目标列表
 *  - ERROR        后端请求失败时返回的自定义错误文案
 *  - AUTH_PATHS   授权路径列表
 *
 * @author
 * @date 2025-06-24
 */

/* ************************************************************************** */
/*                                类型定义                                    */
/* ************************************************************************** */

/**
 * @brief 运行时环境变量接口
 *
 * 与 wrangler.toml/env.* 文件保持一致，字段均为可选。
 */
export interface GithubProxyEnv {
	GH_NAME?: string;
	GH_REPO?: string;
	GH_BRANCH?: string;
	GH_TOKEN?: string;
	URL?: string;
	URL302?: string;
	ERROR?: string;
	AUTH_PATHS?: string;
}

/* ************************************************************************** */
/*                         常量 & 工具函数定义                                 */
/* ************************************************************************** */

const GITHUB_RAW_ORIGIN = 'https://raw.githubusercontent.com';

/**
 * @brief 构建 GitHub Raw 文件直链
 *
 * @param pathname   客户端请求路径，如 /path/to/file
 * @param env        运行时环境变量
 * @return 完整 GitHub Raw URL
 */
function buildGithubRawUrl(pathname: string, env: GithubProxyEnv): string {
	// 若 pathname 本身已是 raw.githubusercontent.com，则原样透传
	if (new RegExp(GITHUB_RAW_ORIGIN, 'i').test(pathname)) {
		return `${GITHUB_RAW_ORIGIN}${pathname.split(GITHUB_RAW_ORIGIN)[1] ?? ''}`;
	}

	const segments: string[] = [GITHUB_RAW_ORIGIN];

	/* 依次追加用户/仓库/分支信息 */
	if (env.GH_NAME) {
		segments.push(env.GH_NAME);

		if (env.GH_REPO) {
			segments.push(env.GH_REPO);

			/* 分支可为空，GitHub 会自动取默认分支 */
			if (env.GH_BRANCH) {
				segments.push(env.GH_BRANCH);
			}
		}
	}

	/* 最终文件路径 */
	segments.push(pathname.replace(/^\/+/, '')); // 去除开头 /
	return segments.join('/');
}

/**
 * @brief 解析请求应携带的 GitHub Token
 *
 * 解析逻辑:
 *  仅使用环境变量 GH_TOKEN，不再支持 URL 查询参数。
 *
 * @param env 运行时环境变量
 * @return 返回有效 Token，若无有效 Token 返回空字符串
 */
function resolveToken(env: GithubProxyEnv): string {
	/*
	 * 从 Cloudflare Workers 环境变量中获取 Token。
	 */
	return env.GH_TOKEN ?? '';
}

/**
 * @brief 将以空白/逗号/换行分隔的字符串拆分为 URL 列表
 *
 * @param rawList 原始字符串
 * @return URL 数组
 */
function parseUrlList(rawList: string): string[] {
	let sanitized = rawList.replace(/[\t|"'\r\n]+/g, ',').replace(/,+/g, ',');
	if (sanitized.startsWith(',')) sanitized = sanitized.slice(1);
	if (sanitized.endsWith(',')) sanitized = sanitized.slice(0, -1);
	return sanitized.split(',');
}

/**
 * @brief 解析受保护目录及其对应密钥映射
 *
 * AUTH_PATHS 配置示例:
 *  "config":"abc123","private":"def456"
 *  支持使用逗号或分号分隔多组键值对，冒号分隔目录与密钥，单双引号可选。
 *
 * @param raw AUTH_PATHS 原始字符串
 * @return 目录到密钥的映射表 (key 为去除首尾 / 的相对路径)
 */
function parseAuthMappings(raw: string): Record<string, string> {
	const mappings: Record<string, string> = {};

	raw.split(/[;,]+/).forEach((segment) => {
		const [rawPath, rawSecret] = segment.split(':');
		if (!rawPath || !rawSecret) return;

		const path = rawPath.replace(/['"\s]+/g, '').replace(/^\/+/g, '').replace(/\/+$/g, '');
		const secret = rawSecret.replace(/['"\s]+/g, '');

		if (path) {
			mappings[path] = secret;
		}
	});

	return mappings;
}

/**
 * @brief 校验受保护目录访问权限
 *
 * @param pathname  请求的 URL.pathname
 * @param request   原始 Request，用于获取查询参数
 * @param env       运行时环境变量
 * @return 若验证通过返回 true，否则返回 false
 */
function isAuthorized(pathname: string, request: Request, env: GithubProxyEnv): boolean {
	if (!env.AUTH_PATHS) {
		return true; // 未配置受保护目录，直接放行
	}

	const mappings = parseAuthMappings(env.AUTH_PATHS);

	// 去除开头 '/'
	const relativePath = pathname.replace(/^\/+/, '');

	for (const [protectedDir, expectedSecret] of Object.entries(mappings)) {
		if (relativePath.startsWith(protectedDir)) {
			const providedSecret = new URL(request.url).searchParams.get('secret');
			return providedSecret === expectedSecret;
		}
	}

	return true; // 不在受保护目录列表
}

/* ************************************************************************** */
/*                            请求处理函数                                    */
/* ************************************************************************** */

/**
 * @brief 处理根路径 (/) 请求
 *
 * 逻辑:
 *  - 若配置 URL302/URL，则随机选取一条进行 302 或反向代理；
 *  - 否则直接返回 Cloudflare 默认 404 页面。
 *
 * @param request 原始请求
 * @param env     运行时环境变量
 * @return 响应
 */
async function handleRootRequest(
	request: Request,
	env: GithubProxyEnv
): Promise<Response> {
	const envKey = env.URL302 ? 'URL302' : env.URL ? 'URL' : null;

	if (envKey) {
		const rawList = env[envKey as keyof GithubProxyEnv] as string;
		const urlList = parseUrlList(rawList);

		/* 简单随机均衡 */
		const target = urlList[Math.floor(Math.random() * urlList.length)];

		return envKey === 'URL302'
			? Response.redirect(target, 302)
			: fetch(new Request(target, request));
	}

	/* 无任何定向配置时，直接返回 Cloudflare 默认 404 页面 */
	return new Response(null, { status: 404 });
}

/**
 * @brief 处理 GitHub 文件直链请求
 *
 * @param urlPathname URL.pathname
 * @param request     原始请求
 * @param env         运行时环境变量
 * @return 响应
 */
async function handleGithubFileRequest(
	urlPathname: string,
	request: Request,
	env: GithubProxyEnv
): Promise<Response> {
	if (!isAuthorized(urlPathname, request, env)) {
		/* 鉴权失败时统一返回 404，避免暴露资源信息 */
		return new Response(null, { status: 404 });
	}

	const rawUrl = buildGithubRawUrl(urlPathname, env);
	const token = resolveToken(env);

	/* Token 为必须项，避免无鉴权下载超时限流 */
	if (!token) {
		return new Response('TOKEN 不能为空', { status: 400 });
	}

	const headers = new Headers({ Authorization: `token ${token}` });

	const githubResp = await fetch(rawUrl, { headers });

	if (githubResp.ok) {
		/* 透传状态码、Header 与 Body */
		return new Response(githubResp.body, {
			status: githubResp.status,
			headers: githubResp.headers,
		});
	}

	/* 若目标资源不存在，直接返回 Cloudflare 默认 404 页面 */
	if (githubResp.status === 404) {
		return new Response(null, { status: 404 });
	}

	/* 其它错误: 返回自定义错误文案或默认文案 */
	const errMsg =
		env.ERROR ?? '无法获取文件，请检查路径或 TOKEN 是否正确。';
	return new Response(errMsg, { status: githubResp.status });
}

/* ************************************************************************** */
/*                             Worker 入口                                    */
/* ************************************************************************** */

/**
 * @brief Worker 主入口
 *
 * @param request 客户端请求
 * @param env     运行时环境变量
 * @return 响应
 */
export default {
	async fetch(
		request: Request,
		env: GithubProxyEnv,
		_ctx: ExecutionContext
	): Promise<Response> {
		const url = new URL(request.url);

		return url.pathname === '/'
			? handleRootRequest(request, env)
			: handleGithubFileRequest(url.pathname, request, env);
	},
};