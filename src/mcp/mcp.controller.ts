import { Controller, Get, Post, Body } from '@nestjs/common';
import { McpService, McpTool, McpToolResult } from './mcp.service';

@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get('tools')
  async listTools(): Promise<{ tools: McpTool[] }> {
    const tools = await this.mcpService.listTools();
    return { tools };
  }

  @Post('tools/call')
  async callTool(
    @Body() body: { name: string; arguments: any },
  ): Promise<McpToolResult> {
    return this.mcpService.callTool(body.name, body.arguments);
  }

  @Post('process')
  async processMessage(
    @Body() body: { message: string; userId: string },
  ): Promise<{ response: string }> {
    const response = await this.mcpService.processNaturalLanguage(
      body.message,
      body.userId,
    );
    return { response };
  }
}
