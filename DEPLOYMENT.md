# HTTPS 部署说明

此目录提供单实例部署模板，尚未在公网环境执行。需要有现成服务器、域名及对应权限。

1. 安装 Docker/Compose 和 Caddy，域名 DNS 指向服务器；开放 80/443，应用 4380 端口仅绑定服务器回环地址。
2. 编辑 `compose.yaml` 的 PUBLIC_URL 为实际域名；把 `Caddyfile.example` 的域名换成同一域名，并交给 Caddy 使用。
3. `docker compose up -d --build`。数据存储在 `compass-data` 持久卷，不能执行删除数据卷的命令，除非明确要销毁资料。
4. **先初始化密码，再对外开放使用**。容器默认不允许通过远程请求初始化。可在服务器容器内向回环接口提交初始化请求，密码从交互输入读取，不放在命令行历史中：

```sh
docker compose exec compass node --input-type=module -e '
import {createInterface} from "node:readline/promises";
const rl=createInterface({input:process.stdin,output:process.stdout});
const password=await rl.question("设置至少 10 位密码（终端会显示输入，请在私有终端操作）：");
rl.close();
const r=await fetch("http://127.0.0.1:4380/api/setup",{method:"POST",headers:{"Content-Type":"application/json","X-Compass-Request":"1"},body:JSON.stringify({password})});
console.log(r.ok?"密码已初始化":await r.text());
'
```

5. 启动 Caddy，通过 HTTPS 登录。手机扫码连接、上传一个真实测试录音，并检查语音识别、客户归属、三维信息及来源。
6. 配置模型并测试后再导入真实资料。当前模板为单用户，不支持多个销售之间的数据隔离；一个工作台只运行一个应用进程，避免重复队列处理。

使用反向代理必须保留同源 Host，正确转发 `X-Forwarded-Proto`。`TRUST_PROXY=1` 只适用于受控的单层代理，应用端口不应被公网绕过代理直连。

长文件上传时反向代理上限应不低于 200 MB。模型处理在上传完成后进入后台队列，不要求浏览器保持请求直到转写结束。录音采集阶段仍需保持手机页面在前台。

备份容器前先停止应用，把整个 `/app/data` 卷备份（含数据库、音频和 `.encryption-key`）。恢复到空卷时注意 node 用户的读写权限，恢复后先验证登录、录音访问和密钥解密。
