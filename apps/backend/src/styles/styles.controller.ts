import { BadRequestException, Controller, Get, NotFoundException, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { isTheme } from "@offline-maps/shared";
import { RegistryService } from "../regions/registry.service.ts";
import { StyleService } from "./style.service.ts";

@Controller("api/styles")
export class StylesController {
  constructor(
    private readonly registry: RegistryService,
    private readonly styles: StyleService,
  ) {}

  @Get(":file")
  async style(
    @Param("file") file: string,
    @Query("theme") theme = "light",
    @Req() req: Request,
  ) {
    if (!file.endsWith(".json")) throw new NotFoundException("styles are served as .json");
    const name = file.replace(/\.json$/, "");

    const region = await this.registry.get(name);
    if (!region) throw new NotFoundException(`unknown region "${name}"`);
    if (!isTheme(theme)) throw new BadRequestException(`unknown theme "${theme}"`);

    return this.styles.build(region, theme, `${req.protocol}://${req.get("host")}`);
  }
}
