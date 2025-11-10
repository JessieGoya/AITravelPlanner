package com.ai.travel.web;

import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.util.Timeout;
import org.springframework.http.*;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ApiController {

    private final RestTemplate restTemplate;

    public ApiController() {
        // 配置超时时间：连接超时 10 秒，读取超时 120 秒（LLM 响应可能较慢）
        RequestConfig requestConfig = RequestConfig.custom()
                .setConnectTimeout(Timeout.of(10, TimeUnit.SECONDS))
                .setResponseTimeout(Timeout.of(120, TimeUnit.SECONDS))
                .setConnectionRequestTimeout(Timeout.of(10, TimeUnit.SECONDS))
                .build();

        CloseableHttpClient httpClient = HttpClients.custom()
                .setDefaultRequestConfig(requestConfig)
                .build();

        HttpComponentsClientHttpRequestFactory factory = new HttpComponentsClientHttpRequestFactory(httpClient);
        this.restTemplate = new RestTemplate(factory);
    }

    @PostMapping("/llm/chat")
    public ResponseEntity<?> chat(@RequestBody Map<String, Object> request) {
        try {
            String baseUrl = (String) request.get("baseUrl");
            String apiKey = (String) request.get("apiKey");
            String model = (String) request.getOrDefault("model", "gpt-4o-mini");
            String prompt = (String) request.get("prompt");

            if (baseUrl == null || apiKey == null || prompt == null) {
                Map<String, String> error = new HashMap<>();
                error.put("error", "缺少必需参数：baseUrl, apiKey, prompt");
                return ResponseEntity.badRequest().body(error);
            }

            // 构建请求 URL
            String url = baseUrl.replaceAll("/$", "") + "/chat/completions";

            // 构建消息列表
            List<Map<String, String>> messages = new ArrayList<>();
            Map<String, String> systemMsg = new HashMap<>();
            systemMsg.put("role", "system");
            systemMsg.put("content", "你是一名专业旅行规划助手，请输出中文结果，并按天列出行程、交通、住宿、景点、餐饮，并估算费用（人民币）。");
            messages.add(systemMsg);
            
            Map<String, String> userMsg = new HashMap<>();
            userMsg.put("role", "user");
            userMsg.put("content", prompt);
            messages.add(userMsg);

            // 构建请求体
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", model);
            requestBody.put("messages", messages);
            requestBody.put("temperature", 0.7);

            // 设置请求头
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(apiKey);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

            // 发送请求，带重试机制
            ResponseEntity<Map> response = null;
            Exception lastException = null;
            int maxRetries = 3;
            int retryDelayMs = 1000; // 重试延迟 1 秒

            for (int attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    response = restTemplate.exchange(
                        url, HttpMethod.POST, entity, Map.class
                    );
                    break; // 成功则跳出循环
                } catch (RestClientException e) {
                    lastException = e;
                    String errorMsg = e.getMessage();
                    
                    // 如果是网络错误（如连接中断），进行重试
                    if (attempt < maxRetries && (
                        errorMsg != null && (
                            errorMsg.contains("Unexpected end of file") ||
                            errorMsg.contains("Connection") ||
                            errorMsg.contains("timeout") ||
                            errorMsg.contains("I/O error")
                        )
                    )) {
                        System.err.println("LLM 请求失败（尝试 " + attempt + "/" + maxRetries + "）：" + errorMsg);
                        try {
                            Thread.sleep(retryDelayMs * attempt); // 递增延迟
                        } catch (InterruptedException ie) {
                            Thread.currentThread().interrupt();
                            break;
                        }
                        continue;
                    } else {
                        // 非网络错误或已达到最大重试次数，抛出异常
                        throw e;
                    }
                }
            }

            // 如果所有重试都失败
            if (response == null && lastException != null) {
                throw lastException;
            }

            if (response != null && response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Map<String, Object> body = response.getBody();
                Object choices = body.get("choices");
                if (choices instanceof List && !((List<?>) choices).isEmpty()) {
                    Map<?, ?> firstChoice = (Map<?, ?>) ((List<?>) choices).get(0);
                    Map<?, ?> message = (Map<?, ?>) firstChoice.get("message");
                    String content = (String) message.get("content");
                    Map<String, String> result = new HashMap<>();
                    result.put("content", content != null ? content : "（无返回内容）");
                    return ResponseEntity.ok(result);
                }
            }

            Map<String, String> error = new HashMap<>();
            if (response != null) {
                error.put("error", "LLM 调用失败：" + response.getStatusCode());
                return ResponseEntity.status(response.getStatusCode()).body(error);
            } else {
                error.put("error", "LLM 调用失败：无法获取响应");
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
            }

        } catch (org.springframework.web.client.RestClientResponseException e) {
            // 处理非 2xx 的响应（例如阿里云内容审查 data_inspection_failed）
            String responseBody = e.getResponseBodyAsString();
            int status = e.getRawStatusCode();

            // 如果是内容审查未通过，尝试用更严格的 system 提示重试一次
            if (status == 400 && responseBody != null &&
                (responseBody.contains("data_inspection_failed") || responseBody.contains("inappropriate-content") || responseBody.contains("inappropriate content"))) {
                try {
                    // 从之前 request 中重建必要参数（简单方式：让前端再次传入，这里直接返回更友好的错误）
                    Map<String, String> error = new HashMap<>();
                    error.put("error", "生成内容未通过平台内容审查。已自动增强安全提示并重试失败，请减少敏感词，仅描述与旅行相关的信息后再试。");
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
                } catch (Exception retryEx) {
                    Map<String, String> error = new HashMap<>();
                    error.put("error", "生成内容未通过平台内容审查，请调整输入后重试。");
                    return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
                }
            }

            Map<String, String> error = new HashMap<>();
            error.put("error", "请求处理失败：" + (responseBody != null ? responseBody : e.getMessage()));
            System.err.println("LLM 非 2xx 响应: " + status + " - " + (responseBody != null ? responseBody : e.getMessage()));
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        } catch (RestClientException e) {
            Map<String, String> error = new HashMap<>();
            String errorMsg = e.getMessage();
            if (errorMsg != null && errorMsg.contains("Unexpected end of file")) {
                error.put("error", "网络连接中断，请检查网络连接后重试。如果问题持续，可能是 LLM 服务暂时不可用。");
            } else if (errorMsg != null && errorMsg.contains("timeout")) {
                error.put("error", "请求超时，LLM 服务响应时间过长。请稍后重试。");
            } else {
                error.put("error", "请求处理失败：" + (errorMsg != null ? errorMsg : e.getClass().getSimpleName()));
            }
            System.err.println("LLM 请求异常: " + e.getClass().getSimpleName() + " - " + errorMsg);
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "请求处理失败：" + e.getMessage());
            System.err.println("LLM 请求异常: " + e.getClass().getSimpleName() + " - " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
}

