import { isMobile, plugin } from "@/utils";
import { openMobileFileById, openTab, showMessage } from "siyuan";
import { openByMobile } from "./utils";
import { getLogger } from "@/libs/logger";
const log = getLogger("syUtils");
export async function addProtyleSlash(slash: any) {
  for (let i = 0; i < plugin.protyleSlash.length; i++) {
    if (plugin.protyleSlash[i].id === slash.id) {
      return;
    }
  }
  plugin.protyleSlash.push(slash);
}

const BlockIDPattern = /^\d{14,}-\w{7}$/;
export function isBlockID(id: string): boolean {
  return BlockIDPattern.test(id);
}

export function openBlockByID(id: string) {
  if (!isBlockID(id)) {
    return;
  }
  if (isMobile) {
    openMobileFileById(plugin.app, id);
  } else {
    // 使用 openTab，保证浏览器环境也能正常打开
    // 添加 action 参数，模拟从侧边栏文件树点击文档的行为
    openTab({
      app: plugin.app, //plugin 是你插件的 this 对象
      doc: {
        id: id,
        action: ["cb-get-focus", "cb-get-scroll"],
      },
    });
    // window.open(`siyuan://blocks/${id}`, "_blank");
  }
}

export function openByUrl(url) {
  url = url.trim();
  log.info("openByUrl:", url);
  if (!url) {
    showMessage("url为空");
    return;
  } else if (isBlockID(url)) {
    isMobile
      ? openMobileFileById(plugin.app, url)
      : window.open(`siyuan://blocks/${url}`, "_blank");
  } else if (url.toLowerCase().startsWith("siyuan://")) {
    plugin.eventBus.emit("open-siyuan-url-plugin", { url });
  } else {
    isMobile ? openByMobile(url) : window.open(url, "_blank");
  }
}
