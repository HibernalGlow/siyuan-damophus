<script lang="ts">
  import {
    Check,
    ChevronDown,
    ChevronUp,
    Clock3,
    Copy,
    Download,
    Eye,
    Focus,
    Grid3X3,
    Play,
    RefreshCw,
    Undo2,
    Upload,
    X,
  } from "lucide-svelte";
</script>

<div class="icon-definitions" aria-hidden="true">
  <Check id="iconCheck" />
  <Clock3 id="iconClock" />
  <X id="iconClose" />
  <Copy id="iconCopy" />
  <ChevronDown id="iconDown" />
  <Download id="iconDownload" />
  <Eye id="iconEye" />
  <Focus id="iconFocus" />
  <Grid3X3 id="iconGrid" />
  <Play id="iconPlay" />
  <RefreshCw id="iconRefresh" />
  <Undo2 id="iconUndo" />
  <ChevronUp id="iconUp" />
  <Upload id="iconUpload" />
</div>

<style>
  .icon-definitions {
    position: fixed;
    width: 0;
    height: 0;
    overflow: hidden;
    pointer-events: none;
  }
</style>
