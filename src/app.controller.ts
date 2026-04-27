import { Controller, Get, Head } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getRoot() {
    return this.appService.getHealth();
  }

  @Head()
  headRoot() {
    return;
  }

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }
}
